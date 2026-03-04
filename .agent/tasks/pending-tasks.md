# 待处理任务列表

**创建时间**: 2026-03-04 21:08
**创建者**: Team Lead

---

## 🔴 P0 - 安全问题（立即处理）

### TASK-001: 修复 Webhook Secret 硬编码
- **类型**: Security
- **优先级**: P0
- **负责人**: backend-dev
- **描述**: 强制要求从环境变量读取 GITHUB_WEBHOOK_SECRET，禁止使用默认值
- **验收标准**:
  - [ ] 服务启动时检查 SECRET 环境变量
  - [ ] 未设置时拒绝启动并报错
  - [ ] 更新 .env.example 文件
- **关联文件**: `webhook/server.js`, `server.js`

### TASK-002: 添加 API 输入验证
- **类型**: Security
- **优先级**: P0
- **负责人**: backend-dev
- **描述**: 为所有 API 端点添加输入验证和长度限制
- **验收标准**:
  - [ ] 验证 message 字段类型和长度（最大 10000 字符）
  - [ ] 验证 agent 字段格式
  - [ ] 返回清晰的错误信息
- **关联文件**: `server.js`

### TASK-003: 添加速率限制
- **类型**: Security
- **优先级**: P0
- **负责人**: backend-dev
- **描述**: 使用 express-rate-limit 添加速率限制防止滥用
- **验收标准**:
  - [ ] 安装 express-rate-limit
  - [ ] 配置合理的限制（如 100 req/15min）
  - [ ] 返回 429 状态码
- **关联文件**: `server.js`, `package.json`

### TASK-004: 移除日志中的敏感信息
- **类型**: Security
- **优先级**: P0
- **负责人**: devops
- **描述**: 检查并移除日志中可能泄露敏感命令参数的内容
- **验收标准**:
  - [ ] 审查 agent-daemon.py 日志输出
  - [ ] 移除命令参数记录
  - [ ] 仅记录任务名称和状态
- **关联文件**: `agent-daemon.py`

---

## 🟡 P1 - 基础设施问题

### TASK-005: 初始化 Git 仓库
- **类型**: Infrastructure
- **优先级**: P1
- **负责人**: devops
- **描述**: 初始化 Git 仓库并创建首次提交
- **验收标准**:
  - [ ] git init
  - [ ] 创建 .gitignore
  - [ ] 初始提交
- **依赖**: 无

### TASK-006: 创建任务跟踪系统
- **类型**: Process
- **优先级**: P1
- **负责人**: team-lead
- **描述**: 建立任务跟踪流程和模板
- **验收标准**:
  - [ ] 创建任务模板
  - [ ] 定义任务状态流转
  - [ ] 集成到工作流
- **依赖**: TASK-005

---

## 🟢 P2 - 架构改进（后续处理）

### TASK-007: 迁移到 TypeScript
- **类型**: Refactor
- **优先级**: P2
- **负责人**: architect → developer
- **描述**: 将 JavaScript 文件迁移到 TypeScript
- **验收标准**:
  - [ ] 配置 tsconfig.json
  - [ ] 转换 server.js → server.ts
  - [ ] 转换 webhook/server.js
- **依赖**: TASK-005, TASK-006

### TASK-008: 添加单元测试
- **类型**: Quality
- **优先级**: P2
- **负责人**: test-engineer
- **描述**: 使用 Jest 添加单元测试
- **验收标准**:
  - [ ] 配置 Jest
  - [ ] 覆盖核心功能
  - [ ] 覆盖率 > 80%
- **依赖**: TASK-007

---

## 📝 任务状态更新日志

| 时间 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2026-03-04 21:08 | TASK-001~006 | Created | 初始创建 |