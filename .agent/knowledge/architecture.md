# 架构决策记录

## 技术栈 v2

### 前端
- **框架**: Vue 3 + TypeScript
- **状态**: 🟡 待迁移（当前主要是 JavaScript）

### 后端
- **框架**: Go + Gin
- **状态**: 🟡 待迁移（当前是 Node.js）

### 数据库
- **类型**: MySQL
- **状态**: 🟡 待配置

---

## 当前架构

### 核心组件

#### 1. RPC 服务器 (server.js)
- **端口**: 3000
- **功能**:
  - 处理 Agent 消息
  - SSE 事件推送
  - 任务执行
- **协议**: HTTP + JSON-RPC

#### 2. Webhook 处理器 (webhook/server.js)
- **端口**: 3333
- **功能**:
  - 接收 GitHub Webhook
  - 验证签名
  - 分发事件
- **安全**: HMAC-SHA256 签名验证

#### 3. 守护进程 (agent-daemon.py)
- **功能**:
  - 定时任务调度
  - 自动化流程
  - 状态监控
- **任务**:
  - check-issues (每 300 秒)
  - check-prs (每 3600 秒)
  - health-check (每 86400 秒)
  - weekly-report (每 604800 秒)

### 扩展系统

| 扩展 | 功能 |
|------|------|
| permission-gate | 权限验证 |
| smart-pruning | 智能剪枝 |
| project-stats | 项目统计 |

---

## 目录结构

```
.
├── .agent/              # Agent 系统
│   ├── knowledge/       # 知识库
│   ├── memory/          # 记忆
│   ├── tasks/           # 任务跟踪
│   └── sessions/        # 会话记录
├── .pi/                 # Pi 配置
│   ├── agents/          # Agent 定义
│   ├── extensions/      # 扩展
│   ├── prompts/         # 提示模板
│   └── skills/          # 技能
├── docs/                # 文档
├── logs/                # 日志
├── scripts/             # 脚本
├── webhook/             # Webhook 处理
├── server.js            # RPC 服务器
├── agent-daemon.py      # 守护进程
└── index.html           # Web UI
```

---

## Agent 团队

| Agent | 职责 |
|-------|------|
| team-lead | 团队协调、任务分配、进度跟踪 |
| product-manager | 需求分析、产品规划 |
| architect | 架构设计、技术选型 |
| backend-dev | 后端开发、API 实现 |
| frontend-dev | 前端开发、UI 实现 |
| devops | 部署、CI/CD、基础设施 |
| test-engineer | 测试、质量保证 |
| reviewer | 代码审查 |

---

## 技术债务

### 🔴 紧急
1. **安全问题**
   - Webhook Secret 硬编码
   - API 缺少输入验证
   - 缺少速率限制
   - 日志敏感信息泄露

### 🟡 重要
1. **类型迁移**
   - JavaScript → TypeScript
   - Node.js → Go（后端）

2. **配置管理**
   - 环境变量统一管理
   - 移除硬编码

### 🟢 次要
1. **测试覆盖**
   - 单元测试
   - 集成测试
   - E2E 测试

2. **监控告警**
   - 日志聚合
   - 性能监控
   - 异常告警

---

## 迁移计划

### 阶段 1: 安全修复 (本周)
- [ ] TASK-001~004: 安全问题修复

### 阶段 2: 基础设施 (下周)
- [ ] TASK-006: GitHub + CI/CD
- [ ] 环境变量管理

### 阶段 3: 类型迁移 (2 周后)
- [ ] TASK-007: TypeScript 迁移
- [ ] TASK-008: 单元测试

### 阶段 4: 后端重构 (1 个月后)
- [ ] Node.js → Go 迁移
- [ ] API 重构

---

**最后更新**: 2026-03-04 21:44