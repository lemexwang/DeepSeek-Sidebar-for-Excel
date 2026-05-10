#!/bin/bash
# 一键启动：DeepSeek proxy + Excel Add-in dev server

set -e

# ── 读取 DeepSeek API Key ─────────────────────────────────────────────────────
if [ -z "$DEEPSEEK_API_KEY" ]; then
  DEEPSEEK_ENV="/Users/alice/Library/Mobile Documents/iCloud~md~obsidian/Documents/Alice_Study_2026/.claude/.deepseek_env"
  if [ -f "$DEEPSEEK_ENV" ]; then
    export $(grep DEEPSEEK_API_KEY "$DEEPSEEK_ENV" | xargs) 2>/dev/null || true
  fi
fi

if [ -z "$DEEPSEEK_API_KEY" ]; then
  echo "错误：未找到 DEEPSEEK_API_KEY，请先设置环境变量"
  exit 1
fi

echo "→ 使用 DEEPSEEK_API_KEY"

# ── 停止旧进程 ────────────────────────────────────────────────────────────────
echo "→ 停止旧进程..."
kill $(lsof -ti :14002) 2>/dev/null || true
kill $(lsof -ti :3000)  2>/dev/null || true
sleep 1

# ── 启动 DeepSeek proxy ───────────────────────────────────────────────────────
echo "→ 启动 DeepSeek proxy (HTTP:14002)..."
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
python3 /Users/alice/bin/deepseek-anthr-proxy.py > /tmp/deepseek-proxy.log 2>&1 &
PROXY_PID=$!

for i in $(seq 1 10); do
  if curl -sf http://localhost:14002/ > /dev/null 2>&1; then
    echo "→ Proxy 就绪 (PID $PROXY_PID)"
    break
  fi
  sleep 0.5
done

# ── 启动 Vite dev server ──────────────────────────────────────────────────────
echo "→ 启动 Excel Add-in dev server (https://localhost:3000)..."
cd "$(dirname "$0")"
npm run dev > /tmp/excel-addin-dev.log 2>&1 &
DEV_PID=$!

for i in $(seq 1 20); do
  if curl -sfk https://localhost:3000/ > /dev/null 2>&1; then
    echo "→ Dev server 就绪 (PID $DEV_PID)"
    break
  fi
  sleep 0.5
done

echo ""
echo "✓ 全部就绪！在 Excel 里打开侧边栏。"
echo "  Proxy PID:      $PROXY_PID  (日志: /tmp/deepseek-proxy.log)"
echo "  Dev server PID: $DEV_PID   (日志: /tmp/excel-addin-dev.log)"
echo ""
echo "按 Ctrl+C 停止所有服务..."
wait
