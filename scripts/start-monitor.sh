#!/bin/bash
# 启动智能监控系统

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 启动 Agent 团队智能监控系统...${NC}"
echo ""

# 检查守护进程是否运行
if ! ps aux | grep -v grep | grep "agent-daemon.py" > /dev/null; then
    echo -e "${YELLOW}⚠️  守护进程未运行，正在启动...${NC}"
    ./scripts/start.sh
fi

# 启动监控
echo ""
echo "📊 监控配置:"
echo "  - 检查间隔: 30秒"
echo "  - 总结间隔: 10分钟"
echo ""
echo "按 Ctrl+C 停止监控"
echo ""

python3 scripts/monitor.py
