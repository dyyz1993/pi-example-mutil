#!/usr/bin/env node
/**
 * GitHub Webhook Handler
 * 
 * 处理 GitHub 事件，调用 pi Agent 团队自动处理
 */

const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PI_WEBHOOK_PORT || 3000;
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();

// 安全：强制要求 Webhook Secret
const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('🔴 错误: 必须设置 GITHUB_WEBHOOK_SECRET 环境变量');
  console.error('   示例: export GITHUB_WEBHOOK_SECRET=your-secret-key');
  process.exit(1);
}

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 验证签名
function verifySignature(payload, signature) {
  const expectedSignature = 'sha256=' + 
    crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return signature === expectedSignature;
}

// 调用 pi
function callPI(prompt) {
  return new Promise((resolve, reject) => {
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const command = `pi -p "${escapedPrompt}" --no-session`;
    
    log(`执行: ${command.slice(0, 100)}...`);
    
    exec(command, { cwd: PROJECT_DIR, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        log(`错误: ${error.message}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

// 处理 Issue 事件
async function handleIssueEvent(payload) {
  const { action, issue, repository } = payload;
  
  log(`Issue ${action}: #${issue.number} - ${issue.title}`);
  
  if (action === 'opened') {
    const prompt = `
作为 Team Lead，分析新创建的 Issue：

仓库: ${repository.full_name}
Issue #${issue.number}: ${issue.title}
内容: ${issue.body || '无描述'}
创建者: ${issue.user.login}

请执行以下操作：
1. 分析 Issue 类型（bug/feature/documentation/question）
2. 评估优先级（P0/P1/P2/P3）
3. 如果是 bug，尝试定位问题并修复
4. 如果是 feature，分析需求并分配给产品经理
5. 在 Issue 中添加评论说明处理结果
6. 更新 .agent/tasks/ 任务列表

如果需要修改代码，请：
- 创建分支 fix/issue-${issue.number}
- 修复问题
- 提交 PR
- 在 Issue 中回复 PR 链接
    `;
    
    try {
      const result = await callPI(prompt);
      log(`处理完成: ${result.slice(0, 200)}...`);
    } catch (error) {
      log(`处理失败: ${error.message}`);
    }
  }
}

// 处理 PR 事件
async function handlePullRequestEvent(payload) {
  const { action, pull_request, repository } = payload;
  
  log(`PR ${action}: #${pull_request.number} - ${pull_request.title}`);
  
  if (action === 'opened' || action === 'synchronize') {
    const prompt = `
作为 Team Lead，审查新创建的 PR：

仓库: ${repository.full_name}
PR #${pull_request.number}: ${pull_request.title}
分支: ${pull_request.head.ref} -> ${pull_request.base.ref}
作者: ${pull_request.user.login}

请执行以下操作：
1. 审查代码质量
2. 检查是否有测试
3. 运行测试（如有）
4. 添加审查评论
5. 如果通过，建议合并
6. 如果有问题，列出修改建议
    `;
    
    try {
      const result = await callPI(prompt);
      log(`审查完成: ${result.slice(0, 200)}...`);
    } catch (error) {
      log(`审查失败: ${error.message}`);
    }
  }
}

// 处理 Comment 事件
async function handleCommentEvent(payload) {
  const { action, comment, issue, repository } = payload;
  
  // 只处理创建评论
  if (action !== 'created') return;
  
  const commentBody = comment.body.toLowerCase();
  
  // 检查是否是命令
  if (commentBody.includes('@bot') || commentBody.includes('@pi')) {
    log(`命令评论: #${issue.number} - ${comment.body}`);
    
    let command = '';
    if (commentBody.includes('fix')) command = 'fix';
    else if (commentBody.includes('test')) command = 'test';
    else if (commentBody.includes('deploy')) command = 'deploy';
    else if (commentBody.includes('status')) command = 'status';
    
    if (command) {
      const prompt = `
作为 Team Lead，处理用户命令：

仓库: ${repository.full_name}
Issue #${issue.number}: ${issue.title}
命令: ${command}
评论者: ${comment.user.login}

请执行命令: ${command}
      `;
      
      try {
        const result = await callPI(prompt);
        log(`命令执行完成: ${result.slice(0, 200)}...`);
      } catch (error) {
        log(`命令执行失败: ${error.message}`);
      }
    }
  }
}

// 处理 Push 事件
async function handlePushEvent(payload) {
  const { ref, commits, repository, pusher } = payload;
  
  log(`Push: ${ref} by ${pusher.name} (${commits.length} commits)`);
  
  // 只处理主分支
  if (ref === 'refs/heads/main' || ref === 'refs/heads/master') {
    const prompt = `
作为 Team Lead，处理代码推送：

仓库: ${repository.full_name}
分支: ${ref}
推送者: ${pusher.name}
提交数: ${commits.length}

提交信息:
${commits.map(c => `- ${c.message}`).join('\n')}

请执行以下操作：
1. 更新知识库（如有必要）
2. 检查是否需要更新文档
3. 记录本次变更
    `;
    
    try {
      const result = await callPI(prompt);
      log(`处理完成: ${result.slice(0, 200)}...`);
    } catch (error) {
      log(`处理失败: ${error.message}`);
    }
  }
}

// 主事件处理器
async function handleGitHubEvent(event, payload) {
  log(`收到事件: ${event}`);
  
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
      log(`未处理的事件: ${event}`);
  }
}

// Webhook 端点
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  
  // 验证签名
  if (!signature || !verifySignature(req.body, signature)) {
    log('签名验证失败');
    return res.status(401).send('Invalid signature');
  }
  
  // 解析 payload
  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (error) {
    log('Payload 解析失败');
    return res.status(400).send('Invalid payload');
  }
  
  // 异步处理事件
  handleGitHubEvent(event, payload).catch(error => {
    log(`事件处理错误: ${error.message}`);
  });
  
  // 立即返回
  res.status(200).send('OK');
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    project: PROJECT_DIR
  });
});

// 启动服务
app.listen(PORT, () => {
  log(`Webhook 服务已启动: http://localhost:${PORT}`);
  log(`项目目录: ${PROJECT_DIR}`);
  log(`等待 GitHub 事件...`);
});

// 优雅退出
process.on('SIGINT', () => {
  log('收到 SIGINT，正在退出...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('收到 SIGTERM，正在退出...');
  process.exit(0);
});