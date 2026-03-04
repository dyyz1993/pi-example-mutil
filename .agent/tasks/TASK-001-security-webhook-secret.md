# TASK-001: 修复 Webhook Secret 硬编码

**创建时间**: 2026-03-04 21:18
**负责人**: backend-dev
**优先级**: P0 (立即处理)
**状态**: 🔴 Pending

---

## 📋 任务描述

强制要求从环境变量读取 `GITHUB_WEBHOOK_SECRET`，禁止使用默认值。

## ✅ 验收标准

- [ ] 服务启动时检查 SECRET 环境变量
- [ ] 未设置时拒绝启动并报错
- [ ] 更新 `.env.example` 文件

## 📁 关联文件

- `webhook/server.js`
- `server.js`
- `.env.example`

## 🔗 依赖关系

无依赖，可立即开始。

## 📝 实施步骤

1. 修改 `webhook/server.js`：
   ```javascript
   const secret = process.env.GITHUB_WEBHOOK_SECRET;
   if (!secret) {
     console.error('ERROR: GITHUB_WEBHOOK_SECRET must be set in environment variables');
     process.exit(1);
   }
   ```

2. 同样修改 `server.js` 中相关配置

3. 创建 `.env.example` 示例文件

## ⏱️ 预计工时

1-2小时

## 🔔 注意事项

- 不要在日志中输出 secret 值
- 确保所有文档都更新环境变量配置说明