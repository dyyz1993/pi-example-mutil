# Agent 团队协作系统设计文档

## 一、系统概述

本系统基于 pi 框架，实现了一个全自动的 AI Agent 团队协作系统，支持：

- **任务自动分配**：Team Lead 根据项目状态智能分配任务
- **知识库管理**：所有知识库修改需经过审核
- **记忆持久化**：每个 Agent 拥有独立的个人记忆
- **外部调度**：支持定时任务、Git 钩子、Webhook 等触发方式

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        外部调度器                                 │
│                  (cron / systemd / GitHub Actions)               │
│                                                                 │
│   触发条件：                                                      │
│   • 定时任务（每天9点检查项目状态）                                 │
│   • Git 事件（代码提交、PR、Issue）                               │
│   • Webhook（外部系统通知）                                       │
│   • 手动触发                                                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Team Lead                                 │
│                     (主控 Agent)                                 │
│                                                                 │
│   职责：                                                         │
│   • 分析当前状态                                                  │
│   • 分配任务给合适的成员                                          │
│   • 审核所有知识库修改                                            │
│   • 汇总结果并决策下一步                                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │ 产品经理   │    │  架构师   │    │  DevOps   │
   └───────────┘    └───────────┘    └───────────┘
         ▼                ▼                ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │ 后端开发   │    │ 前端开发  │    │ 测试工程师 │
   └───────────┘    └───────────┘    └───────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     共享记忆系统                                  │
│                                                                 │
│   .agent/                                                       │
│   ├── memory/           # 个人记忆                              │
│   ├── knowledge/        # 团队知识库（需审核）                    │
│   └── tasks/            # 任务管理                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、文件结构

```
project/
├── .agent/                          # Agent 系统
│   ├── memory/                      # 个人记忆（私有）
│   │   ├── team-lead.md             # Team Lead 的记忆
│   │   ├── product-manager.md       # 产品经理的记忆
│   │   ├── architect.md             # 架构师的记忆
│   │   ├── backend-dev.md           # 后端开发的记忆
│   │   ├── frontend-dev.md          # 前端开发的记忆
│   │   ├── test-engineer.md         # 测试工程师的记忆
│   │   └── devops.md                # DevOps 的记忆
│   │
│   ├── knowledge/                   # 团队知识库（共享，需审核）
│   │   ├── architecture.md          # 架构决策
│   │   ├── api-design.md            # API 规范
│   │   ├── database.md              # 数据库设计
│   │   ├── conventions.md           # 编码规范
│   │   └── decisions.md             # 重要决策记录
│   │
│   ├── tasks/                       # 任务管理
│   │   ├── active.md                # 当前任务
│   │   ├── pending.md               # 待处理任务
│   │   └── completed.md             # 已完成任务
│   │
│   └── state.json                   # 全局状态
│
├── .pi/                             # pi 配置
│   └── agents/                      # Agent 定义
│       ├── team-lead.md
│       ├── product-manager.md
│       ├── architect.md
│       ├── backend-dev.md
│       ├── frontend-dev.md
│       ├── test-engineer.md
│       └── devops.md
│
├── scripts/                         # 调度脚本
│   ├── scheduled-check.sh           # 定时检查
│   ├── git-hook.sh                  # Git 钩子
│   └── webhook-handler.sh           # Webhook 处理
│
└── docs/                            # 文档
    └── agent-system-design.md       # 本设计文档
```

---

## 四、核心组件

### 4.1 Memory Guard 扩展

**文件位置**：`~/.pi/agent/extensions/memory-guard.ts`

**功能**：
- 保护 `.agent/memory/`、`.agent/knowledge/`、`.agent/tasks/` 目录
- 所有写入请求需经过 Team Lead 审核
- Team Lead 会加载知识库和个人记忆进行审核
- 支持审核历史查询

**工具列表**：

| 工具名称 | 功能描述 |
|---------|---------|
| `request_write` | 请求写入受保护的文件 |
| `review_history` | 查看审核历史 |
| `pending_reviews` | 查看待审核请求 |
| `manual_review` | 手动审核 |

### 4.2 Agent 定义

每个 Agent 都有独立的配置文件，定义其职责、技能和模型。

**示例**：

```markdown
# Team Lead

你是团队领导，负责协调和管理整个开发团队。

## 职责
- 分配任务给团队成员
- 审核知识库修改
- 监控项目进度
- 解决团队阻塞问题

## 工具
- subagent
- request_write
- review_history
- read
- bash

## 模型
glm/glm-5
```

### 4.3 记忆系统

**个人记忆**（`.agent/memory/`）：
- 每个 Agent 独立的记忆
- 记录任务进度、发现、问题
- 自动注入到 Agent 调用中

**团队知识库**（`.agent/knowledge/`）：
- 所有 Agent 共享的知识
- 需要审核才能修改
- 包含架构、API、数据库等核心信息

**任务管理**（`.agent/tasks/`）：
- 活跃任务、待处理任务、已完成任务
- Team Lead 负责分配和更新

---

## 五、工作流程

### 5.1 定时项目检查

```bash
# crontab -e
# 每天 9 点检查项目状态
0 9 * * * cd /project && ./scripts/scheduled-check.sh
```

**流程**：
1. 外部调度器触发
2. 调用 Team Lead 检查项目状态
3. Team Lead 读取任务列表和记忆
4. 分析并分配任务
5. 更新任务状态和记忆

### 5.2 代码提交触发

```bash
# .git/hooks/post-commit
#!/bin/bash
pi -p "作为 Team Lead，分析代码提交..." --no-session
```

**流程**：
1. Git 钩子触发
2. Team Lead 分析提交内容
3. 决定是否需要测试、审查、部署
4. 调用相应 Agent 执行任务

### 5.3 Issue 创建触发

```bash
# GitHub Webhook 处理
pi -p "作为产品经理，分析新创建的 Issue..." --no-session
```

**流程**：
1. Webhook 接收事件
2. 产品经理分析 Issue
3. 评估优先级并分配
4. 创建任务记录

---

## 六、审核机制

### 6.1 审核流程

```
Agent 想要修改知识库
        │
        ▼
   request_write
        │
        ▼
   创建审核请求
        │
        ▼
   Team Lead 审核
   (加载知识库 + 记忆)
        │
   ┌────┴────┐
   ▼         ▼
 通过       拒绝
   │         │
   ▼         ▼
 写入文件   返回建议
```

### 6.2 审核标准

| 标准 | 说明 |
|------|------|
| **准确性** | 信息是否准确？有没有明显错误？ |
| **一致性** | 是否与现有知识冲突？ |
| **完整性** | 信息是否完整？有没有遗漏关键内容？ |
| **规范性** | 格式是否符合规范？是否清晰易读？ |
| **安全性** | 是否包含敏感信息？是否可能造成系统失控？ |

### 6.3 审核示例

**请求**：
```
request_write({
  filePath: ".agent/knowledge/architecture.md",
  content: "把 React 改成 Vue，Node.js 改成 Go",
  reason: "更新技术栈"
})
```

**审核结果**：❌ 拒绝
- 与现有知识冲突
- 缺乏充分论证
- 可能导致项目失控

---

## 七、使用示例

### 7.1 初始化项目

```bash
# 创建目录结构
mkdir -p .agent/{memory,knowledge,tasks}
mkdir -p .pi/agents
mkdir -p scripts

# 创建知识库
cat > .agent/knowledge/architecture.md << 'EOF'
# 架构决策

## 技术栈
- 前端：React 18 + TypeScript
- 后端：Node.js + Express
- 数据库：PostgreSQL
EOF

# 创建 Team Lead 记忆
cat > .agent/memory/team-lead.md << 'EOF'
# Team Lead 记忆

## 2024-03-04
- 项目启动
- 技术选型完成
- 任务已分配
EOF
```

### 7.2 调用 Agent

```bash
# 手动触发 Team Lead 检查
pi -p "作为 Team Lead，检查项目状态并分配今日任务"

# 写入知识库（会触发审核）
pi -p "使用 request_write 工具更新架构决策"
```

### 7.3 定时任务

```bash
# 添加到 crontab
crontab -e

# 每天 9 点检查
0 9 * * * cd /project && pi -p "作为 Team Lead，检查项目状态" --no-session

# 每 5 分钟监控服务器
*/5 * * * * cd /project && pi -p "作为 DevOps，检查服务器状态" --no-session
```

---

## 八、扩展开发

### 8.1 添加新的 Agent

1. 创建 Agent 定义文件：

```bash
cat > .pi/agents/data-engineer.md << 'EOF'
# Data Engineer

你是数据工程师，负责数据处理和分析。

## 职责
- 数据管道开发
- 数据清洗和转换
- 数据分析报告

## 模型
glm/glm-5
EOF
```

2. 创建记忆文件：

```bash
touch .agent/memory/data-engineer.md
```

### 8.2 自定义审核规则

编辑 `~/.pi/agent/extensions/memory-guard.ts`：

```typescript
// 添加自定义审核规则
const CUSTOM_RULES = [
  {
    pattern: /password|secret|api_key/i,
    action: "reject",
    message: "包含敏感信息"
  },
  {
    pattern: /TODO|FIXME|XXX/,
    action: "warn",
    message: "包含未完成标记"
  }
];
```

---

## 九、最佳实践

### 9.1 记忆管理

- **定期清理**：每周清理过期的记忆
- **结构化记录**：使用固定的格式记录任务
- **关键信息突出**：重要决策用标记突出

### 9.2 任务分配

- **负载均衡**：考虑各 Agent 当前负载
- **专长匹配**：根据 Agent 专长分配任务
- **优先级排序**：高优先级任务优先处理

### 9.3 审核策略

- **宽松模式**：开发环境允许快速迭代
- **严格模式**：生产环境需要多人审核
- **自动审核**：简单变更可自动通过

---

## 十、故障排查

### 10.1 扩展未加载

```bash
# 检查扩展
pi --help | grep request_write

# 如果没有，检查文件
ls ~/.pi/agent/extensions/memory-guard.ts
```

### 10.2 审核失败

```bash
# 查看审核历史
pi -p "使用 review_history 工具查看审核历史"
```

### 10.3 记忆丢失

```bash
# 检查记忆文件
cat .agent/memory/team-lead.md

# 如果丢失，重新创建
touch .agent/memory/team-lead.md
```

---

## 十一、未来规划

### 11.1 短期目标

- [ ] 完善审核机制，支持多级审核
- [ ] 添加通知系统（邮件、Slack）
- [ ] 支持 Webhook 集成

### 11.2 长期目标

- [ ] Agent 自主学习能力
- [ ] 跨项目知识共享
- [ ] 可视化仪表盘

---

## 十二、总结

本系统通过 pi 框架实现了：

1. **团队协作**：多个 Agent 角色分工协作
2. **知识管理**：受保护的知识库，需要审核才能修改
3. **记忆持久化**：每个 Agent 拥有独立的记忆
4. **自动化**：支持外部调度器和事件触发

这为全自动化开发和运维奠定了基础。