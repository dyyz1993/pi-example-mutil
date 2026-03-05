#!/bin/bash
# 一键启动完整的 Agent 监控系统

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动 Agent 团队完整监控系统${NC}"
echo "=========================================="

# 1. 启动守护进程
echo -e "${YELLOW}[1/3] 启动守护进程...${NC}"
./scripts/start.sh 2>&1 | tail -5

# 2. 启动后台监控
echo ""
echo -e "${YELLOW}[2/3] 启动后台监控...${NC}"
pkill -f "monitor.py" 2>/dev/null || true
nohup python3 scripts/monitor.py > logs/monitor.log 2>&1 &
echo $! > pids/monitor.pid
echo -e "${GREEN}✅ 后台监控已启动 (PID: $(cat pids/monitor.pid))${NC}"

# 3. 显示仪表盘
echo ""
echo -e "${YELLOW}[3/3] 启动监控仪表盘...${NC}"
echo ""
echo -e "${BLUE}按 Ctrl+C 退出仪表盘 (后台服务继续运行)${NC}"
echo ""

sleep 2
python3 scripts/dashboard.py
