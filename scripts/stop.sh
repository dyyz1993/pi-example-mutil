#!/bin/bash
# 停止 Agent 团队自动化系统

echo "🛑 停止 Agent 团队自动化系统..."

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 停止守护进程
if [ -f "pids/agent-daemon.pid" ]; then
    PID=$(cat pids/agent-daemon.pid)
    if kill -0 $PID 2>/dev/null; then
        echo "  停止守护进程 (PID: $PID)..."
        kill $PID
        echo "  ✓ 守护进程已停止"
    fi
    rm -f pids/agent-daemon.pid
else
    echo "  守护进程未运行"
fi

echo ""
echo "✅ Agent 团队自动化系统已停止"