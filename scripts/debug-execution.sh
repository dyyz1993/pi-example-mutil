#!/bin/bash
# Agent 调试脚本 - 手动测试单个任务执行

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Agent 调试工具${NC}"
echo "================================"

# 1. 捕获执行前状态
echo -e "\n${YELLOW}[1/5] 捕获执行前状态...${NC}"
BEFORE_FILES=$(find . -type f -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.go" 2>/dev/null | wc -l)
BEFORE_GIT=$(git status --porcelain 2>/dev/null | wc -l)
echo "  文件数: $BEFORE_FILES"
echo "  Git 变更: $BEFORE_GIT"

# 2. 执行任务
echo -e "\n${YELLOW}[2/5] 执行测试任务...${NC}"
TASK="${1:-创建一个简单的 hello.txt 文件，内容是 Hello World}"

# 设置环境
export PATH="/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin:$PATH"
export NVM_DIR="/Users/xuyingzhou/.nvm"

echo "  任务: $TASK"
echo ""

START_TIME=$(date +%s)

# 执行 pi
/Users/xuyingzhou/.nvm/versions/node/v25.2.1/bin/pi -p "$TASK" --no-session 2>&1 | tee logs/debug-output.log

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${BLUE}执行耗时: ${ELAPSED}秒${NC}"

# 3. 捕获执行后状态
echo -e "\n${YELLOW}[3/5] 捕获执行后状态...${NC}"
AFTER_FILES=$(find . -type f -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.go" 2>/dev/null | wc -l)
AFTER_GIT=$(git status --porcelain 2>/dev/null | wc -l)
echo "  文件数: $AFTER_FILES"
echo "  Git 变更: $AFTER_GIT"

# 4. 分析变化
echo -e "\n${YELLOW}[4/5] 分析变化...${NC}"
FILES_DIFF=$((AFTER_FILES - BEFORE_FILES))
GIT_DIFF=$((AFTER_GIT - BEFORE_GIT))

if [ $FILES_DIFF -ne 0 ] || [ $GIT_DIFF -ne 0 ] || [ $AFTER_GIT -gt 0 ]; then
    echo -e "${GREEN}✅ 检测到实际变化!${NC}"
    echo "  文件变化: $FILES_DIFF"
    echo "  Git 变化: $GIT_DIFF"

    echo -e "\n${GREEN}变更详情:${NC}"
    if [ $AFTER_GIT -gt 0 ]; then
        git status --short
    fi
else
    echo -e "${RED}❌ 未检测到实际变化 - Agent 可能只生成了报告${NC}"
fi

# 5. 生成报告
echo -e "\n${YELLOW}[5/5] 生成调试报告...${NC}"
REPORT_FILE="logs/debug-report-$(date +%Y%m%d_%H%M%S).json"

cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "task": "$TASK",
  "elapsed_seconds": $ELAPSED,
  "before": {
    "files": $BEFORE_FILES,
    "git_changes": $BEFORE_GIT
  },
  "after": {
    "files": $AFTER_FILES,
    "git_changes": $AFTER_GIT
  },
  "diff": {
    "files": $FILES_DIFF,
    "git": $GIT_DIFF
  },
  "has_real_changes": $([ $FILES_DIFF -ne 0 ] || [ $GIT_DIFF -ne 0 ] || [ $AFTER_GIT -gt 0 ] && echo "true" || echo "false")
}
EOF

echo -e "${GREEN}✅ 报告已保存: $REPORT_FILE${NC}"
echo ""
echo "================================"
