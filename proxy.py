#!/usr/bin/env python3
"""
Minimal DeepSeek Anthropic API proxy.
Fixes tool name mismatch: Claude Code sends 'WebSearch'/'WebFetch' but
DeepSeek expects 'web_search'/'web_fetch'. DeepSeek handles web_search
server-side, so we just fix names and pass through.

Usage:
  DEEPSEEK_API_KEY=sk-... PROXY_PORT=14002 python3 deepseek-anthr-proxy.py
"""

import json
import os
import re
import sys
import time
import threading
import urllib.request
import urllib.error
import socketserver
import concurrent.futures
from http.server import BaseHTTPRequestHandler
from datetime import datetime
from html.parser import HTMLParser

# Pre-import at startup to avoid per-request import overhead
try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    _DDGS_AVAILABLE = False

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE = "https://api.deepseek.com/anthropic"
PORT = int(os.environ.get("PROXY_PORT", "14002"))
DEBUG = os.environ.get("PROXY_DEBUG", "0") == "1"

LOG_PATH = "/tmp/deepseek-proxy-req.log"

# ── Search cache ─────────────────────────────────────────────────────────────
# { (query, n) -> (timestamp, results) }
_search_cache: dict = {}
CACHE_TTL = 300        # seconds — reuse results within 5 minutes
SEARCH_TIMEOUT = 15    # seconds — total budget across all backend attempts
SNIPPET_MAX = 2000      # chars — truncate each snippet to keep token count low
DEFAULT_N = 3          # default number of results (was 5)

# 8 workers: parallel html+lite per request needs 2 slots, so 4 concurrent searches
_search_executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)

# ── Per-burst search rate limiter ─────────────────────────────────────────────
# A "burst" is any sequence of searches with gaps < BURST_RESET_SECS between them.
# Within a burst, at most MAX_BURST_SEARCHES real DDG calls are allowed; after that,
# further calls return an instant "stop searching" signal to the model.
MAX_BURST_SEARCHES = 5
BURST_RESET_SECS   = 45   # >45 s gap = new burst (new user message)

_burst_lock  = threading.Lock()
_burst_count = 0
_burst_last  = 0.0   # time of last non-cached search


def _burst_check() -> bool:
    """Return True if this search should be rate-limited (no DDG call).
    Resets the counter automatically when a new burst is detected."""
    global _burst_count, _burst_last
    with _burst_lock:
        now = time.time()
        if now - _burst_last > BURST_RESET_SECS:
            _burst_count = 0          # new burst — reset
        _burst_last = now
        if _burst_count >= MAX_BURST_SEARCHES:
            return True               # blocked
        _burst_count += 1
        return False                  # allowed


def log(msg: str) -> None:
    ts = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{ts}] {msg}\n")
    if DEBUG:
        print(f"[deepseek-proxy] {msg}", file=sys.stderr, flush=True)


class _TextExtractor(HTMLParser):
    """Strip HTML tags, skipping boilerplate sections (nav/script/style/etc.)."""
    _SKIP = {'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe', 'form'}

    def __init__(self):
        super().__init__()
        self._depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP:
            self._depth += 1

    def handle_endtag(self, tag):
        if tag in self._SKIP:
            self._depth = max(0, self._depth - 1)

    def handle_data(self, data):
        if self._depth == 0:
            self._parts.append(data)

    def get_text(self) -> str:
        return re.sub(r'\s+', ' ', ''.join(self._parts)).strip()


def html_to_text(html_str: str) -> str:
    extractor = _TextExtractor()
    try:
        extractor.feed(html_str)
    except Exception:
        pass
    return extractor.get_text()


# Tool name normalization.
NAME_MAP = {
    "WebFetch": "web_fetch",
    "web_fetch": "web_fetch",
}


def fix_tool_names(body: dict) -> dict:
    tools = body.get("tools", [])
    fixed = 0
    for t in tools:
        old_name = t.get("name", "")
        if old_name in NAME_MAP:
            new_name = NAME_MAP[old_name]
            if old_name != new_name:
                t["name"] = new_name
                fixed += 1
    if fixed:
        log(f"Fixed {fixed} tool field(s)")
    return body


def fix_tool_choice(body: dict) -> dict:
    # DeepSeek reasoning models reject tool_choice entirely. The model name
    # here is an Anthropic name (claude-3-5-sonnet etc.) that DeepSeek maps
    # internally to deepseek-reasoner, so model-name checks don't work.
    # Stripping unconditionally is safe: with a single tool in the request,
    # DeepSeek will use it when appropriate.
    if "tool_choice" in body:
        tc = body["tool_choice"]
        body = {k: v for k, v in body.items() if k != "tool_choice"}
        log(f"Stripped tool_choice={tc!r} model={body.get('model', '?')!r}")
    return body


MAX_WEB_SEARCHES = 3    # web_search hard cap per turn
MAX_TOOL_CALLS    = 60  # total tool calls hard cap per turn
# 12 = 3 searches + 1 read + 1 insert_paragraph + 1 insert_table
#      + 1 set_column_widths + 1 format_table + 3 spare = enough for full workflow


def _count_tool_use(body: dict, name: str | None = None) -> int:
    """Count tool_use blocks in conversation history, optionally filtered by name."""
    return sum(
        1
        for msg in body.get("messages", [])
        for block in (msg.get("content", []) if isinstance(msg.get("content"), list) else [])
        if isinstance(block, dict)
        and block.get("type") == "tool_use"
        and (name is None or block.get("name") == name)
    )


def cap_web_search(body: dict) -> dict:
    """Remove web_search from tools once its call count reaches MAX_WEB_SEARCHES."""
    count = _count_tool_use(body, "web_search")
    if count >= MAX_WEB_SEARCHES:
        original = len(body.get("tools", []))
        tools = [t for t in body.get("tools", []) if t.get("name") != "web_search"]
        if len(tools) < original:
            log(f"CAP web_search after {count} calls — removed from tools")
            body = {**body, "tools": tools}
    return body


# Per-tool call limits — stricter than MAX_TOOL_CALLS to prevent specific bad patterns.
# Once a tool reaches its limit, it is removed from the tools list for this turn.
PER_TOOL_LIMITS = {
    "insert_table":           1,  # each call creates a NEW table — never call twice
    "set_column_widths":      1,
    "format_table":           1,
    "get_document_text":      1,  # reading repeatedly is pure waste
    "get_document_structure": 1,
    # everything else defaults to PER_TOOL_DEFAULT
}
PER_TOOL_DEFAULT = 2  # any other tool: max 2 per turn


def cap_per_tool(body: dict) -> dict:
    """Remove tools that have already been called up to their per-tool limit."""
    counts: dict[str, int] = {}
    for msg in body.get("messages", []):
        for block in (msg.get("content", []) if isinstance(msg.get("content"), list) else []):
            if isinstance(block, dict) and block.get("type") == "tool_use":
                name = block.get("name", "")
                counts[name] = counts.get(name, 0) + 1

    capped = set()
    for name, count in counts.items():
        if name == "web_search":
            continue  # has its own cap_web_search
        limit = PER_TOOL_LIMITS.get(name, PER_TOOL_DEFAULT)
        if count >= limit:
            capped.add(name)

    if capped:
        original = body.get("tools", [])
        tools = [t for t in original if t.get("name") not in capped]
        if len(tools) < len(original):
            log(f"CAP per-tool: removed {','.join(sorted(capped))} (limits reached)")
            body = {**body, "tools": tools}
    return body


def cap_total_tools(body: dict) -> dict:
    """Once total tool calls reach MAX_TOOL_CALLS, inject a stop instruction
    into the conversation and system prompt. Does NOT set tools=[] because
    an empty tools list causes DeepSeek to fall back to raw DSML/XML output."""
    count = _count_tool_use(body)
    if count < MAX_TOOL_CALLS:
        return body

    log(f"CAP all tools after {count} total calls — injecting stop")

    # ── 1. Append stop notice to system prompt ────────────────────────────────
    system = body.get("system", "")
    stop_notice = (
        "\n\nCRITICAL OVERRIDE: You have used the maximum allowed number of tool calls. "
        "You MUST stop calling tools immediately. Write your final answer to the user "
        "as plain text RIGHT NOW. Do not invoke any tool under any circumstances."
    )
    if stop_notice[:20] not in system:
        body = {**body, "system": system + stop_notice}

    # ── 2. Append stop block to last user message ─────────────────────────────
    messages = list(body.get("messages", []))
    if messages and messages[-1].get("role") == "user":
        last = messages[-1]
        content = last.get("content", [])
        stop_block = {
            "type": "text",
            "text": "[STOP] Tool limit reached. Do not call any more tools. Provide your complete final answer as plain text now.",
        }
        if isinstance(content, list):
            messages[-1] = {**last, "content": list(content) + [stop_block]}
        body = {**body, "messages": messages}

    return body


def make_sse_transformer():
    """Return a per-connection SSE transformer with its own index state."""
    server_tool_indices: set = set()   # indices of server_tool_use blocks
    dsml_depth = 0  # track nesting inside DeepSeek's native <tool_calls> XML fallback

    def transform(line: str) -> str:
        nonlocal dsml_depth
        if not line.startswith("data: "):
            return line
        try:
            event = json.loads(line[6:])
        except json.JSONDecodeError:
            return line

        etype = event.get("type", "")
        delta = event.get("delta", {})
        cb    = event.get("content_block", {})
        idx   = event.get("index")

        # ── server_tool_use: hide the search-query JSON from the text stream ──
        if etype == "content_block_start" and cb.get("type") == "server_tool_use":
            server_tool_indices.add(idx)
            event["content_block"] = {"type": "text", "text": ""}
            return f"data: {json.dumps(event)}\n"

        if etype == "content_block_delta" and delta.get("type") == "input_json_delta":
            if idx in server_tool_indices:
                event["delta"] = {"type": "text_delta", "text": ""}
                return f"data: {json.dumps(event)}\n"

        if etype == "content_block_stop":
            server_tool_indices.discard(idx)

        # ── DSML fallback stripping ────────────────────────────────────────────
        # When tools=[] DeepSeek falls back to its native <tool_calls>…</tool_calls>
        # XML format in the text stream. Strip it so it never reaches the front-end.
        if etype == "content_block_delta" and delta.get("type") == "text_delta":
            text = delta.get("text", "")
            dsml_depth += text.count("<tool_calls>") - text.count("</tool_calls>")
            if dsml_depth > 0 or "<tool_calls>" in text:
                event["delta"] = {"type": "text_delta", "text": ""}
                return f"data: {json.dumps(event)}\n"
            if dsml_depth < 0:
                dsml_depth = 0

        return line

    return transform


def _extract_search_text(delta: dict) -> str:
    parts = []
    results = delta.get("results", delta.get("web_search_tool_result", {}))
    if isinstance(results, list):
        for r in results:
            if isinstance(r, dict):
                title = r.get("title", "")
                snippet = r.get("snippet", r.get("description", r.get("text", "")))
                url = r.get("url", "")
                if title or snippet:
                    parts.append(f"### {title}\n{snippet}\n{url}")
            elif isinstance(r, str):
                parts.append(r)
    elif isinstance(results, dict):
        title = results.get("title", "")
        snippet = results.get("snippet", results.get("description", ""))
        if title or snippet:
            parts.append(f"### {title}\n{snippet}")
    elif isinstance(results, str):
        parts.append(results)

    if not parts:
        text = delta.get("text", str(delta))
        parts.append(text)

    return "\n\n---\n\n".join(parts)


def handle_response(oai_resp: dict) -> dict:
    content = oai_resp.get("content", [])
    new_content = []
    for block in content:
        if block.get("type") == "web_search_tool_result":
            text = _extract_search_text(block)
            new_content.append({"type": "text", "text": text})
        else:
            new_content.append(block)
    if new_content != content:
        oai_resp = {**oai_resp, "content": new_content}
    return oai_resp


def _ddg_search(query: str, max_results: int, backend: str = "html") -> list:
    """Run a DuckDuckGo search with the given backend and return results list."""
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results, backend=backend):
            snippet = r.get("body", "")
            if len(snippet) > SNIPPET_MAX:
                snippet = snippet[:SNIPPET_MAX] + "…"
            results.append({
                "title": r.get("title", ""),
                "snippet": snippet,
                "url": r.get("href", ""),
            })
    return results


def cached_search(query: str, max_results: int) -> tuple[list, bool]:
    """Return (results, from_cache). Runs html+lite backends in parallel; caches hits."""
    key = (query, max_results)
    now = time.time()

    if key in _search_cache:
        ts, results = _search_cache[key]
        if now - ts < CACHE_TTL:
            log(f"SEARCH cache hit: {query!r}")
            return results, True

    t0 = time.time()
    # Launch html and lite backends in parallel — return whichever responds first
    futures = {
        _search_executor.submit(_ddg_search, query, max_results, "html"): "html",
        _search_executor.submit(_ddg_search, query, max_results, "lite"): "lite",
    }

    results = None
    remaining = SEARCH_TIMEOUT
    while futures and results is None and remaining > 0:
        done, _ = concurrent.futures.wait(
            list(futures), timeout=remaining, return_when=concurrent.futures.FIRST_COMPLETED
        )
        remaining = SEARCH_TIMEOUT - (time.time() - t0)
        for f in done:
            backend = futures.pop(f)
            try:
                r = f.result()
                if r:
                    results = r
                    log(f"SEARCH ok ({backend}) {time.time()-t0:.2f}s n={len(r)}: {query!r}")
                    break
                else:
                    log(f"SEARCH {backend} empty: {query!r}")
            except Exception as e:
                log(f"SEARCH {backend} error: {e}")

    # Cancel any still-running futures to free threads
    for f in futures:
        f.cancel()

    if results is None:
        log(f"SEARCH all backends failed after {time.time()-t0:.2f}s: {query!r}")
        results = [{
            "title": "Search unavailable",
            "snippet": "Could not retrieve results from DuckDuckGo. "
                       "Try a shorter or simpler query.",
            "url": "",
        }]

    _search_cache[key] = (now, results)
    return results, False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _health(self):
        body = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self._health()

    def _do_fetch(self):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        url = qs.get("url", [""])[0]
        if not url:
            self.send_json({"error": "missing ?url="})
            return
        
        log(f"FETCH: {url!r}")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read().decode('utf-8', errors='ignore')
                text = html_to_text(raw)
                self.send_json({"url": url, "content": text[:8000]})
        except Exception as e:
            log(f"FETCH ERROR: {e}")
            self.send_json({"error": str(e)})

    def _do_search(self):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        query = qs.get("q", [""])[0]
        max_results = int(qs.get("n", [str(DEFAULT_N)])[0])
        if not query:
            self.send_json({"error": "missing ?q="})
            return
        if not _DDGS_AVAILABLE:
            self.send_json({"error": "ddgs package not installed", "results": []})
            return

        # Check cache before counting against rate limit
        key = (query, max_results)
        now = time.time()
        if key in _search_cache:
            ts, cached = _search_cache[key]
            if now - ts < CACHE_TTL:
                log(f"SEARCH cache hit: {query!r}")
                self.send_json({"query": query, "results": cached, "cached": True})
                return

        # Cache miss — enforce burst rate limit
        if _burst_check():
            log(f"SEARCH burst-limited: {query!r}")
            stop_result = [{
                "title": "Search limit reached",
                "snippet": (
                    "You have already performed the maximum searches for this request. "
                    "Stop calling web_search. Use only the information already retrieved "
                    "to complete the task and give the user a final answer now."
                ),
                "url": "",
            }]
            self.send_json({"query": query, "results": stop_result, "cached": False})
            return

        results, from_cache = cached_search(query, max_results)
        self.send_json({"query": query, "results": results, "cached": from_cache})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _do_deep_research(self):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        query = qs.get("q", [""])[0]
        if not query:
            self.send_json({"error": "missing ?q="})
            return

        log(f"DEEP_RESEARCH: {query!r}")

        # Step 1: search with more results than a plain web_search
        results, _ = cached_search(query, max_results=5)

        # Step 2: fetch full content from top 2 reachable URLs
        fetched = []
        for r in results[:5]:
            url = r.get("url", "")
            if not url or len(fetched) >= 2:
                continue
            try:
                req = urllib.request.Request(
                    url,
                    headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    raw = resp.read().decode('utf-8', errors='ignore')
                    text = html_to_text(raw)
                    fetched.append({"url": url, "title": r.get("title", ""), "content": text[:3000]})
                    log(f"DEEP_RESEARCH fetched {url!r} ({len(text)} chars)")
            except Exception as e:
                log(f"DEEP_RESEARCH fetch error {url!r}: {e}")

        self.send_json({"query": query, "search_results": results, "fetched_pages": fetched})

    def do_GET(self):
        if self.path.startswith("/deep_research"):
            self._do_deep_research()
        elif self.path.startswith("/fetch"):
            self._do_fetch()
        elif self.path.startswith("/search"):
            self._do_search()
        else:
            self._health()

    def do_POST(self):
        if not self.path.startswith("/v1/messages"):
            self.send_error(404)
            return

        t0 = time.time()
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")

        is_stream = body.get("stream", False)
        tools_count = len(body.get("tools", []))
        msgs_count = len(body.get("messages", []))
        model_name = body.get("model", "")
        has_tc = "tool_choice" in body
        # Log the tool name(s) the model called in the most recent assistant turn
        last_tool = "—"
        for msg in reversed(body.get("messages", [])):
            if msg.get("role") == "assistant":
                names = [b.get("name","?") for b in (msg.get("content",[]) if isinstance(msg.get("content"),list) else []) if isinstance(b,dict) and b.get("type")=="tool_use"]
                if names: last_tool = ",".join(names)
                break
        log(f"REQ msgs={msgs_count} last_tool={last_tool} model={model_name!r}")

        body = fix_tool_names(body)
        body = fix_tool_choice(body)
        body = cap_web_search(body)
        body = cap_per_tool(body)
        body = cap_total_tools(body)

        req = urllib.request.Request(
            f"{DEEPSEEK_BASE}/v1/messages",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "x-api-key": DEEPSEEK_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )

        try:
            if is_stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self._cors()
                self.end_headers()
                transform_sse_line = make_sse_transformer()   # per-connection state
                try:
                    with urllib.request.urlopen(req, timeout=300) as resp:
                        buf = b""
                        for chunk in iter(lambda: resp.read(4096), b""):
                            buf += chunk
                            while b"\n" in buf:
                                line_bytes, buf = buf.split(b"\n", 1)
                                line = (line_bytes + b"\n").decode("utf-8", errors="replace")
                                line = transform_sse_line(line)
                                try:
                                    self.wfile.write(line.encode())
                                    self.wfile.flush()
                                except (BrokenPipeError, ConnectionResetError):
                                    return
                        if buf:
                            try:
                                self.wfile.write(buf)
                                self.wfile.flush()
                            except (BrokenPipeError, ConnectionResetError):
                                return
                    log(f"DONE stream {time.time() - t0:.2f}s")
                except urllib.error.HTTPError as e:
                    err = e.read().decode()
                    log(f"HTTP ERROR (stream) {e.code}: {err[:500]}")
                    # Headers already sent as 200 SSE — emit an error event so the client
                    # gets a meaningful message instead of "request ended without sending any chunks"
                    error_event = json.dumps({
                        "type": "error",
                        "error": {"type": "api_error", "message": err[:500]}
                    })
                    try:
                        self.wfile.write(f"data: {error_event}\n\ndata: [DONE]\n\n".encode())
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                    return
            else:
                with urllib.request.urlopen(req, timeout=300) as resp:
                    result = json.loads(resp.read())
                result = handle_response(result)

                body_bytes = json.dumps(result).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body_bytes)))
                self._cors()
                self.end_headers()
                self.wfile.write(body_bytes)
                log(f"DONE non-stream {time.time() - t0:.2f}s")

        except (BrokenPipeError, ConnectionResetError):
            pass
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            log(f"HTTP ERROR {e.code}: {err[:500]}")
            try:
                self.send_response(e.code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"error": {"message": err, "type": "api_error", "code": str(e.code)}}).encode()
                )
            except (BrokenPipeError, ConnectionResetError):
                pass
        except Exception as e:
            log(f"ERROR: {e}")
            try:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"error": {"message": str(e), "type": "internal_error"}}).encode()
                )
            except (BrokenPipeError, ConnectionResetError):
                pass


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    if not DEEPSEEK_API_KEY:
        print("ERROR: DEEPSEEK_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    server = ThreadingServer(("", PORT), Handler)
    print(f"DeepSeek proxy on port {PORT}", file=sys.stderr, flush=True)
    log(f"START port={PORT}")
    server.serve_forever()
