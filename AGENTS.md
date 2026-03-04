# 项目协作规则

## 项目信息
这是一个示例项目，用于演示 pi 的多团队协作能力。

## 代码规范
- 使用 TypeScript
- 使用 ESLint + Prettier
- 提交信息遵循 Conventional Commits

## 工作流程
1. 新功能：先让 product-manager 分析需求
2. 开发：让 developer 或 frontend-dev/backend-dev 实现
3. 测试：让 test-engineer 编写测试
4. 审查：让 reviewer 进行代码审查

## 禁止操作
- 不要直接修改 .env 文件
- 不要提交敏感信息
- 不要跳过测试

## 常用命令
- `npm run dev` - 开发模式
- `npm test` - 运行测试
- `npm run build` - 构建
