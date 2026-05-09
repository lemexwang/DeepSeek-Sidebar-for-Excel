#!/bin/bash
# 一键启动：Gemma proxy (HTTP+HTTPS) + Add-in dev server

set -e

# ── 读取 API Key ─────────────────────────────────────────────────────────────
if [ -z "$GOOGLE_API_KEY" ]; then
  export GOOGLE_API_KEY="AIzaSyALknM0gBcBiMXYmiBonuyXhC4Z_O6lWk4"
fi

echo "→ 使用 GOOGLE_API_KEY (来自 ~/.baoyu-skills/.env)"

# ── 停止旧进程 ────────────────────────────────────────────────────────────────
echo "→ 停止旧进程..."
kill $(lsof -ti :14001) 2>/dev/null || true
kill $(lsof -ti :14443) 2>/dev/null || true
kill $(lsof -ti :3000)  2>/dev/null || true
sleep 1

# ── 启动 Gemma proxy ──────────────────────────────────────────────────────────
echo "→ 启动 Gemma proxy (HTTP:14001 / HTTPS:14443)..."
GOOGLE_API_KEY="$GOOGLE_API_KEY" \
PROXY_PORT=14001 \
PROXY_HTTPS_PORT=14443 \
GEMMA_MODEL="${GEMMA_MODEL:-gemma-4-31b-it}" \
python3 /Users/alice/bin/gemma-anthr-proxy.py > /tmp/gemma-proxy.log 2>&1 &
PROXY_PID=$!

for i in $(seq 1 10); do
  if curl -sf http://localhost:14001/ > /dev/null 2>&1; then
    echo "→ Proxy 就绪 (PID $PROXY_PID)"
    break
  fi
  sleep 0.5
done

# ── 启动 Vite dev server ──────────────────────────────────────────────────────
echo "→ 启动 Add-in dev server (https://localhost:3000)..."
cd "$(dirname "$0")"
npm run dev > /tmp/addin-dev.log 2>&1 &
DEV_PID=$!

for i in $(seq 1 10); do
  if curl -sfk https://localhost:3000/ > /dev/null 2>&1; then
    echo "→ Dev server 就绪 (PID $DEV_PID)"
    break
  fi
  sleep 0.5
done

echo ""
echo "✓ 全部就绪！在 Excel 里点击 'Show Claude' 打开侧边栏。"
echo "  Proxy PID:     $PROXY_PID  (日志: /tmp/gemma-proxy.log)"
echo "  Dev server PID:$DEV_PID   (日志: /tmp/addin-dev.log)"
echo ""
echo "按 Ctrl+C 停止所有服务..."
wait
