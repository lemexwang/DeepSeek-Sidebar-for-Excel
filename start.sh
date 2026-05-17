#!/bin/bash
# Start: DeepSeek proxy + Excel Add-in dev server

set -e

# ── DeepSeek API Key ──────────────────────────────────────────────────────────
if [ -z "$DEEPSEEK_API_KEY" ]; then
  echo "Error: DEEPSEEK_API_KEY is not set."
  echo "Usage: DEEPSEEK_API_KEY=sk-... ./start.sh"
  echo "   or: export DEEPSEEK_API_KEY=sk-... && ./start.sh"
  exit 1
fi

echo "→ Using DEEPSEEK_API_KEY"

# ── Stop old processes ────────────────────────────────────────────────────────
echo "→ Stopping old processes..."
kill $(lsof -ti :14002) 2>/dev/null || true
kill $(lsof -ti :3002)  2>/dev/null || true
sleep 1

# ── Start DeepSeek proxy ──────────────────────────────────────────────────────
echo "→ Starting DeepSeek proxy (HTTP:14002)..."
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
python3 "$(dirname "$0")/proxy.py" > /tmp/deepseek-proxy.log 2>&1 &
PROXY_PID=$!

for i in $(seq 1 10); do
  if curl -sf http://localhost:14002/ > /dev/null 2>&1; then
    echo "→ Proxy ready (PID $PROXY_PID)"
    break
  fi
  sleep 0.5
done

# ── Start Vite dev server ─────────────────────────────────────────────────────
echo "→ Starting Excel Add-in dev server (https://localhost:3002)..."
cd "$(dirname "$0")"
npm run dev > /tmp/excel-addin-dev.log 2>&1 &
DEV_PID=$!

for i in $(seq 1 20); do
  if curl -sfk https://localhost:3002/ > /dev/null 2>&1; then
    echo "→ Dev server ready (PID $DEV_PID)"
    break
  fi
  sleep 0.5
done

echo ""
echo "✓ All services running! Open the sidebar in Excel."
echo "  Proxy PID:      $PROXY_PID  (log: /tmp/deepseek-proxy.log)"
echo "  Dev server PID: $DEV_PID   (log: /tmp/excel-addin-dev.log)"
echo ""
echo "Press Ctrl+C to stop all services..."
wait
