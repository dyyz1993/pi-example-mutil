#!/bin/bash
# 查看 Agent 团队自动化系统状态

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "📊 Agent 团队自动化系统状态"
echo "================================"
echo ""

# 检查 pi
echo "🔧 核心组件:"
if command -v pi &> /dev/null; then
    PI_VERSION=$(pi --version 2>/dev/null || echo "未知")
    echo -e "  - pi: ${GREEN}已安装${NC} (v$PI_VERSION)"
else
    echo -e "  - pi: ${RED}未安装${NC}"
fi

# 检查扩展
if [ -f "$HOME/.pi/agent/extensions/memory-guard.ts" ]; then
    echo -e "  - memory-guard 扩展: ${GREEN}已安装${NC}"
else
    echo -e "  - memory-guard 扩展: ${RED}未安装${NC}"
fi

echo ""

# 守护进程状态
echo "📡 守护进程:"
if [ -f "pids/agent-daemon.pid" ]; then
    PID=$(cat pids/agent-daemon.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -e "  - 状态: ${GREEN}运行中${NC} (PID: $PID)"
        # 显示运行时间
        UPTIME=$(ps -p $PID -o etime= 2>/dev/null | tr -d ' ')
        if [ -n "$UPTIME" ]; then
            echo "  - 运行时间: $UPTIME"
        fi
    else
        echo -e "  - 状态: ${RED}已停止${NC}"
    fi
else
    echo -e "  - 状态: ${YELLOW}未启动${NC}"
fi

echo ""

# 知识库状态
echo "📚 知识库状态:"
if [ -d ".agent/knowledge" ]; then
    KN_FILES=$(ls -1 .agent/knowledge/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "  - 知识文件: $KN_FILES 个"
fi

if [ -d ".agent/memory" ]; then
    MEM_FILES=$(ls -1 .agent/memory/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "  - 记忆文件: $MEM_FILES 个"
fi

if [ -d ".agent/tasks" ]; then
    TASK_FILES=$(ls -1 .agent/tasks/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "  - 任务文件: $TASK_FILES 个"
fi

echo ""

# 最近日志
echo "📝 最近日志:"
if [ -d "logs" ]; then
    for LOG in logs/*.log; do
        if [ -f "$LOG" ]; then
            LINES=$(wc -l < "$LOG" | tr -d ' ')
            SIZE=$(ls -lh "$LOG" | awk '{print $5}')
            echo "  - $(basename $LOG): $LINES 行 ($SIZE)"
        fi
    done
else
    echo "  - 无日志"
fi

echo ""

# 最近执行记录
if [ -f "logs/daemon.log" ]; then
    echo "📋 最近执行记录:"
    tail -10 logs/daemon.log 2>/dev/null | grep -E "\[.*\]" | tail -5
fi

echo ""
echo "================================"