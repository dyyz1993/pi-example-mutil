#!/bin/bash
# 一键启动 Agent 团队自动化系统

set -e

echo "🚀 启动 Agent 团队自动化系统..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 项目目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 1. 检查依赖
echo -e "${YELLOW}[1/4] 检查依赖...${NC}"
if ! command -v pi &> /dev/null; then
    echo -e "${RED}错误: pi 未安装${NC}"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}错误: Python3 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 依赖检查通过${NC}"

# 2. 创建必要目录
echo -e "${YELLOW}[2/4] 创建目录结构...${NC}"
mkdir -p .agent/memory
mkdir -p .agent/knowledge
mkdir -p .agent/tasks
mkdir -p .agent/sessions
mkdir -p logs
mkdir -p pids

echo -e "${GREEN}✓ 目录创建完成${NC}"

# 3. 初始化知识库
echo -e "${YELLOW}[3/4] 初始化知识库...${NC}"
if [ ! -f ".agent/knowledge/architecture.md" ]; then
    cat > .agent/knowledge/architecture.md << 'EOF'
# 架构决策

## 系统概述
- 项目名称: 金币交易系统
- 技术栈: 待定

## 核心功能
- 金币系统
- 交易系统
- 任务系统
- GitHub 自动化
EOF
    echo "  创建 architecture.md"
fi

if [ ! -f ".agent/memory/team-lead.md" ]; then
    cat > .agent/memory/team-lead.md << EOF
# Team Lead 记忆

## 系统状态
- 状态: 已启动
- 启动时间: $(date)

## 当前任务
- 等待分配
EOF
    echo "  创建 team-lead.md"
fi

echo -e "${GREEN}✓ 知识库初始化完成${NC}"

# 4. 启动守护进程
echo -e "${YELLOW}[4/4] 启动守护进程...${NC}"

# 停止旧进程
if [ -f "pids/agent-daemon.pid" ]; then
    OLD_PID=$(cat pids/agent-daemon.pid)
    if kill -0 $OLD_PID 2>/dev/null; then
        echo "  停止旧进程 (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
        sleep 1
    fi
    rm -f pids/agent-daemon.pid
fi

# 启动新进程
echo "  启动 Python 守护进程..."

# 导出 NVM 环境
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$NVM_DIR/versions/node/v25.2.1/bin:$PATH"
export NODE_PATH="$NVM_DIR/versions/node/v25.2.1/lib/node_modules"

# 使用 env 启动，确保环境变量传递
nohup env PATH="$PATH" NODE_PATH="$NODE_PATH" python3 agent-daemon.py > logs/daemon.log 2>&1 &
echo $! > pids/agent-daemon.pid

sleep 1

if kill -0 $(cat pids/agent-daemon.pid) 2>/dev/null; then
    echo -e "${GREEN}  ✓ 守护进程已启动 (PID: $(cat pids/agent-daemon.pid))${NC}"
else
    echo -e "${RED}  ✗ 启动失败，请查看 logs/daemon.log${NC}"
    exit 1
fi

# 完成
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   🎉 Agent 团队自动化系统已启动！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📋 定时任务:"
echo "  - 每 5 分钟: 检查 GitHub Issue"
echo "  - 每小时: 检查 PR"
echo "  - 每天: 检查项目健康状态"
echo "  - 每周: 生成周报"
echo ""
echo "🔧 管理命令:"
echo "  - 查看状态: ./scripts/status.sh"
echo "  - 停止服务: ./scripts/stop.sh"
echo "  - 查看日志: tail -f logs/daemon.log"
echo "  - 手动触发: pi -p \"你的任务\""
echo ""