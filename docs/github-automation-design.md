# GitHub Issue 自动处理系统设计

## 一、系统概述

基于 GitHub Webhook + Agent 团队的 24 小时全自动开发系统：

- **自动处理 Issue**：新 Issue 自动分析、分配、修复
- **自动代码审查**：PR 自动审查、测试
- **自动部署**：测试通过后自动部署
- **持续监控**：定时检查项目状态

---

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub                                    │
│                                                                 │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐                 │
│   │  Issue    │  │    PR     │  │  Comment  │                 │
│   └───────────┘  └───────────┘  └───────────┘                 │
│         │              │              │                         │
│         └──────────────┼──────────────┘                         │
│                        │                                        │
│                        ▼                                        │
│                  ┌───────────┐                                  │
│                  │  Webhook  │                                  │
│                  └───────────┘                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Webhook Handler                               │
│                   (Node.js 服务)                                │
│                                                                 │
│   • 验证签名                                                    │
│   • 解析事件                                                    │
│   • 分类处理                                                    │
│   • 调用 pi                                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Team Lead                                  │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                      决策流程                             │  │
│   │                                                         │  │
│   │  Issue 创建 → 分析类型 → 分配任务 → 执行修复 → 提交 PR   │  │
│   │                                                         │  │
│   │  PR 创建   → 代码审查 → 运行测试 → 合并/反馈             │  │
│   │                                                         │  │
│   │  Comment  → 分析意图 → 执行操作 → 回复结果               │  │
│   │                                                         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   可用工具：                                                    │
│   • subagent: 调用其他 Agent                                   │
│   • request_write: 写入知识库                                  │
│   • read/bash/edit/write: 操作代码                             │
│   • gh: GitHub CLI 操作                                        │
└─────────────────────────────────────────────────────────────────┘
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
```

---

## 三、事件处理流程

### 3.1 Issue 创建

```
GitHub Issue 创建
        │
        ▼
   Webhook 触发
        │
        ▼
   Team Lead 分析
        │
        ├─── Bug Report ──→ 后端开发/前端开发 → 修复 → 提交 PR
        │
        ├─── Feature Request ──→ 产品经理 → 架构师 → 开发 → 提交 PR
        │
        ├─── Documentation ──→ 文档工程师 → 更新文档 → 提交 PR
        │
        └─── Question ──→ 直接回复
```

### 3.2 PR 创建

```
GitHub PR 创建
        │
        ▼
   Webhook 触发
        │
        ▼
   Team Lead 分析
        │
        ▼
   测试工程师
        │
        ├─── 运行测试 ──→ 通过 → 代码审查 → 合并
        │                │
        │                └─── 失败 → 反馈问题 → 等待修复
        │
        └─── 代码审查 ──→ 通过 → 合并 → 自动部署
                         │
                         └─── 问题 → 反馈 → 等待修改
```

### 3.3 Comment 事件

```
GitHub Comment
        │
        ▼
   Webhook 触发
        │
        ▼
   Team Lead 分析
        │
        ├─── "@bot fix" ──→ 自动修复
        │
        ├─── "@bot test" ──→ 运行测试
        │
        ├─── "@bot deploy" ──→ 部署
        │
        └─── 普通评论 ──→ 忽略或智能回复
```

---

## 四、外部调度

### 4.1 定时任务

```bash
# crontab -e

# 每 5 分钟检查新的 Issue/PR
*/5 * * * * cd /project && ./scripts/check-github.sh

# 每小时检查项目健康状态
0 * * * * cd /project && ./scripts/health-check.sh

# 每天 2 点清理过期数据
0 2 * * * cd /project && ./scripts/cleanup.sh

# 每周一 9 点生成周报
0 9 * * 1 cd /project && ./scripts/weekly-report.sh
```

### 4.2 守护进程模式

```bash
# 使用 systemd 保持 24 小时运行
# /etc/systemd/system/pi-agent.service

[Unit]
Description=PI Agent Service
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/project
ExecStart=/usr/bin/node /project/webhook/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 五、核心组件

### 5.1 Webhook Handler

```typescript
// webhook/server.ts
import express from 'express';
import crypto from 'crypto';

const app = express();
const SECRET = process.env.GITHUB_WEBHOOK_SECRET!;

// 验证签名
function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = 'sha256=' + 
    crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return signature === expectedSignature;
}

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  
  // 验证签名
  if (!verifySignature(req.body, signature)) {
    return res.status(401).send('Invalid signature');
  }
  
  const payload = JSON.parse(req.body.toString());
  
  // 处理事件
  try {
    await handleGitHubEvent(event, payload);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling event:', error);
    res.status(500).send('Error');
  }
});

// 事件处理器
async function handleGitHubEvent(event: string, payload: any) {
  switch (event) {
    case 'issues':
      await handleIssueEvent(payload);
      break;
    case 'pull_request':
      await handlePullRequestEvent(payload);
      break;
    case 'issue_comment':
      await handleCommentEvent(payload);
      break;
    case 'push':
      await handlePushEvent(payload);
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Issue 事件处理
async function handleIssueEvent(payload: any) {
  const { action, issue, repository } = payload;
  
  if (action === 'opened') {
    // 调用 Team Lead 分析 Issue
    await callTeamLead(`
作为 Team Lead，分析新创建的 Issue：

仓库: ${repository.full_name}
Issue #${issue.number}: ${issue.title}
内容: ${issue.body || '无描述'}

请：
1. 分析 Issue 类型（bug/feature/documentation/question）
2. 评估优先级（P0/P1/P2/P3）
3. 分配给合适的开发者
4. 如果是 bug，尝试自动修复
5. 更新 .agent/tasks/ 任务列表
    `);
  }
}

// 调用 Team Lead
async function callTeamLead(prompt: string) {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    const { stdout } = await execAsync(`pi -p "${prompt.replace(/"/g, '\\"')}" --no-session`);
    return stdout;
  } catch (error) {
    console.error('Error calling Team Lead:', error);
    throw error;
  }
}

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### 5.2 GitHub CLI 封装

```typescript
// scripts/github-tools.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitHubTools {
  
  // 创建 Issue
  static async createIssue(
    repo: string, 
    title: string, 
    body: string,
    labels?: string[]
  ): Promise<{ number: number; url: string }> {
    let cmd = `gh issue create --repo ${repo} --title "${title}" --body "${body}"`;
    if (labels?.length) {
      cmd += ` --label ${labels.join(',')}`;
    }
    
    const { stdout } = await execAsync(cmd);
    const match = stdout.match(/\/issues\/(\d+)/);
    
    return {
      number: match ? parseInt(match[1]) : 0,
      url: stdout.trim()
    };
  }
  
  // 添加评论
  static async addComment(
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<string> {
    const { stdout } = await execAsync(
      `gh issue comment ${issueNumber} --repo ${repo} --body "${body}"`
    );
    return stdout;
  }
  
  // 创建 PR
  static async createPR(
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<{ number: number; url: string }> {
    const { stdout } = await execAsync(
      `gh pr create --repo ${repo} --title "${title}" --body "${body}" --head ${head} --base ${base}`
    );
    const match = stdout.match(/\/pull\/(\d+)/);
    
    return {
      number: match ? parseInt(match[1]) : 0,
      url: stdout.trim()
    };
  }
  
  // 合并 PR
  static async mergePR(
    repo: string,
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'squash'
  ): Promise<void> {
    await execAsync(
      `gh pr merge ${prNumber} --repo ${repo} --${method} --delete-branch`
    );
  }
  
  // 获取 Issue 列表
  static async getIssues(
    repo: string,
    state: 'open' | 'closed' = 'open',
    labels?: string[]
  ): Promise<any[]> {
    let cmd = `gh issue list --repo ${repo} --state ${state} --json number,title,body,labels,createdAt`;
    if (labels?.length) {
      cmd += ` --label ${labels.join(',')}`;
    }
    
    const { stdout } = await execAsync(cmd);
    return JSON.parse(stdout);
  }
  
  // 获取 PR 列表
  static async getPRs(
    repo: string,
    state: 'open' | 'closed' | 'merged' = 'open'
  ): Promise<any[]> {
    const { stdout } = await execAsync(
      `gh pr list --repo ${repo} --state ${state} --json number,title,body,headRefName,baseRefName`
    );
    return JSON.parse(stdout);
  }
  
  // 克隆仓库
  static async clone(repo: string, dir: string): Promise<void> {
    await execAsync(`gh repo clone ${repo} ${dir}`);
  }
  
  // 推送分支
  static async push(branch: string, remote: string = 'origin'): Promise<void> {
    await execAsync(`git push ${remote} ${branch}`);
  }
}
```

### 5.3 自动修复流程

```typescript
// scripts/auto-fix.ts
import { GitHubTools } from './github-tools';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AutoFix {
  
  static async fixIssue(
    repo: string,
    issueNumber: number,
    issue: { title: string; body: string }
  ): Promise<void> {
    console.log(`开始处理 Issue #${issueNumber}: ${issue.title}`);
    
    // 1. 创建分支
    const branchName = `fix/issue-${issueNumber}`;
    await execAsync(`git checkout -b ${branchName}`);
    
    // 2. 调用 Team Lead 分析并修复
    const prompt = `
作为 Team Lead，分析并修复以下 Issue：

Issue #${issueNumber}: ${issue.title}
内容: ${issue.body || '无描述'}

请：
1. 分析问题原因
2. 定位相关代码文件
3. 生成修复方案
4. 执行修复（使用 edit/write 工具）
5. 编写测试（如有必要）
6. 更新文档（如有必要）

修复完成后，总结修改内容。
    `;
    
    const result = await callPI(prompt);
    
    // 3. 提交修改
    await execAsync(`git add .`);
    await execAsync(`git commit -m "fix: ${issue.title} (closes #${issueNumber})"`);
    
    // 4. 推送分支
    await GitHubTools.push(branchName);
    
    // 5. 创建 PR
    const pr = await GitHubTools.createPR(
      repo,
      `Fix: ${issue.title}`,
      `## 修复内容\n\n${result}\n\nCloses #${issueNumber}`,
      branchName
    );
    
    console.log(`PR 已创建: ${pr.url}`);
    
    // 6. 添加评论
    await GitHubTools.addComment(
      repo,
      issueNumber,
      `🤖 自动修复已提交，请查看 PR #${pr.number}\n\n${pr.url}`
    );
  }
}

async function callPI(prompt: string): Promise<string> {
  const { stdout } = await execAsync(`pi -p "${prompt.replace(/"/g, '\\"')}" --no-session`);
  return stdout;
}
```

---

## 六、Team Lead Agent 定义

```markdown
# Team Lead - GitHub 自动处理

你是团队领导，负责自动处理 GitHub Issue 和 PR。

## 职责

### Issue 处理
1. 分析 Issue 类型（bug/feature/documentation/question）
2. 评估优先级（P0/P1/P2/P3）
3. 分配给合适的开发者
4. 如果是 bug，尝试自动修复
5. 更新任务列表

### PR 处理
1. 代码审查
2. 运行测试
3. 决定是否合并

### 修复流程
1. 定位问题代码
2. 生成修复方案
3. 执行修复
4. 编写测试
5. 提交 PR

## 工具

### 内置工具
- read: 读取文件
- bash: 执行命令
- edit: 编辑文件
- write: 写入文件

### 自定义工具
- request_write: 写入知识库（需审核）
- review_history: 查看审核历史
- gh: GitHub CLI 操作

### GitHub CLI 常用命令
```bash
# 创建 Issue
gh issue create --title "标题" --body "内容"

# 添加评论
gh issue comment 123 --body "评论内容"

# 创建 PR
gh pr create --title "标题" --body "内容" --head feature-branch

# 合并 PR
gh pr merge 456 --squash

# 查看 Issue
gh issue view 123

# 查看 PR
gh pr view 456
```

## 决策原则

### 优先级判断
- P0: 系统崩溃、数据丢失、安全漏洞
- P1: 核心功能异常、性能问题
- P2: 一般功能问题、体验优化
- P3: 文档更新、小优化

### 任务分配
- Bug: 后端开发 / 前端开发
- Feature: 产品经理 → 架构师 → 开发
- Documentation: 文档工程师
- Test: 测试工程师

### 自动修复条件
- 问题明确、影响范围小
- 有足够信息定位代码
- 修复方案简单清晰

## 模型
glm/glm-5
```

---

## 七、使用示例

### 7.1 部署 Webhook 服务

```bash
# 1. 克隆项目
git clone https://github.com/your-org/your-project.git
cd your-project

# 2. 安装依赖
npm install

# 3. 配置环境变量
export GITHUB_WEBHOOK_SECRET="your-secret"
export GITHUB_TOKEN="your-token"

# 4. 启动服务
npm run webhook

# 或使用 PM2 保持运行
pm2 start npm --name "webhook" -- run webhook
```

### 7.2 配置 GitHub Webhook

1. 进入 GitHub 仓库设置
2. 添加 Webhook: `http://your-server:3000/webhook`
3. 选择触发事件: Issues, Pull requests, Issue comments
4. 设置 Secret

### 7.3 手动触发处理

```bash
# 检查未处理的 Issue
pi -p "作为 Team Lead，检查 GitHub 上未处理的 Issue，分析并分配任务"

# 处理特定 Issue
pi -p "作为 Team Lead，分析并修复 Issue #123"

# 检查 PR 状态
pi -p "作为 Team Lead，检查待处理的 PR，进行代码审查"
```

### 7.4 定时任务

```bash
# 添加到 crontab
crontab -e

# 每 5 分钟检查 Issue
*/5 * * * * cd /project && pi -p "检查未处理的 Issue" --no-session >> /var/log/pi-issue.log 2>&1

# 每小时检查 PR
0 * * * * cd /project && pi -p "检查待处理的 PR" --no-session >> /var/log/pi-pr.log 2>&1

# 每天清理
0 2 * * * cd /project && ./scripts/cleanup.sh
```

---

## 八、完整工作流示例

```
用户创建 Issue: "登录页面 500 错误"
        │
        ▼
   GitHub Webhook 触发
        │
        ▼
   Team Lead 分析
   ┌──────────────────────────────────┐
   │ Issue 类型: Bug                   │
   │ 优先级: P1                        │
   │ 分配给: 后端开发                  │
   └──────────────────────────────────┘
        │
        ▼
   后端开发 Agent
   ┌──────────────────────────────────┐
   │ 1. 读取错误日志                   │
   │ 2. 定位问题代码                   │
   │ 3. 分析错误原因                   │
   │ 4. 生成修复方案                   │
   └──────────────────────────────────┘
        │
        ▼
   执行修复
   ┌──────────────────────────────────┐
   │ edit: src/auth/login.ts          │
   │ write: tests/auth.test.ts        │
   └──────────────────────────────────┘
        │
        ▼
   测试工程师 Agent
   ┌──────────────────────────────────┐
   │ 运行测试: npm test                │
   │ 结果: 通过                        │
   └──────────────────────────────────┘
        │
        ▼
   提交 PR
   ┌──────────────────────────────────┐
   │ 分支: fix/issue-123              │
   │ PR: Fix: 登录页面 500 错误        │
   │ 评论: 🤖 自动修复已提交           │
   └──────────────────────────────────┘
        │
        ▼
   等待人工审核
        │
        ▼
   合并 PR → 自动部署
```

---

## 九、安全考虑

### 9.1 权限控制
- Webhook 验证签名
- API Token 最小权限
- 敏感操作需人工确认

### 9.2 操作限制
- 自动修复仅限非核心代码
- 核心模块修改需人工审核
- 大规模重构需批准

### 9.3 审计日志
- 记录所有自动操作
- 保留操作证据
- 支持回滚

---

## 十、未来扩展

### 10.1 智能分析
- 根据 Issue 自动生成测试用例
- 根据代码变更自动更新文档
- 根据错误日志自动定位问题

### 10.2 多仓库支持
- 统一管理多个项目
- 跨项目依赖分析
- 共享 Agent 团队

### 10.3 可视化
- 实时展示 Agent 工作状态
- 任务进度看板
- 性能统计报表