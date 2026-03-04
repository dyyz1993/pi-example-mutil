#!/usr/bin/env node
/**
 * 简单的测试运行器
 * 
 * 用法: node scripts/test.js
 */

import { spawn } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试用例
const tests = [
  {
    name: 'server.js 语法检查',
    run: async () => {
      const result = spawn('node', ['--check', join(ROOT_DIR, 'server.js')], {
        stdio: 'pipe'
      });
      return new Promise((resolve) => {
        result.on('close', (code) => {
          resolve({ passed: code === 0, message: code === 0 ? '语法正确' : '语法错误' });
        });
      });
    }
  },
  {
    name: 'webhook/server.js 语法检查',
    run: async () => {
      const result = spawn('node', ['--check', join(ROOT_DIR, 'webhook/server.js')], {
        stdio: 'pipe'
      });
      return new Promise((resolve) => {
        result.on('close', (code) => {
          resolve({ passed: code === 0, message: code === 0 ? '语法正确' : '语法错误' });
        });
      });
    }
  },
  {
    name: 'agent-daemon.py 语法检查',
    run: async () => {
      const result = spawn('python3', ['-m', 'py_compile', join(ROOT_DIR, 'agent-daemon.py')], {
        stdio: 'pipe'
      });
      return new Promise((resolve) => {
        result.on('close', (code) => {
          resolve({ passed: code === 0, message: code === 0 ? '语法正确' : '语法错误' });
        });
      });
    }
  },
  {
    name: '安全配置检查 - GITHUB_WEBHOOK_SECRET',
    run: async () => {
      const content = await readFile(join(ROOT_DIR, 'webhook/server.js'), 'utf-8');
      // 检查是否移除了默认的 'your-secret'
      const hasHardcodedSecret = content.includes("'your-secret'");
      return {
        passed: !hasHardcodedSecret,
        message: hasHardcodedSecret ? '仍使用硬编码 Secret' : '已移除硬编码 Secret'
      };
    }
  },
  {
    name: '安全配置检查 - 输入验证',
    run: async () => {
      const content = await readFile(join(ROOT_DIR, 'server.js'), 'utf-8');
      const hasInputValidation = content.includes('Invalid message') && content.includes('Message too long');
      return {
        passed: hasInputValidation,
        message: hasInputValidation ? '已添加输入验证' : '缺少输入验证'
      };
    }
  },
  {
    name: '安全配置检查 - 速率限制',
    run: async () => {
      const content = await readFile(join(ROOT_DIR, 'server.js'), 'utf-8');
      const hasRateLimit = content.includes('rateLimiter') && content.includes('Too many requests');
      return {
        passed: hasRateLimit,
        message: hasRateLimit ? '已添加速率限制' : '缺少速率限制'
      };
    }
  },
  {
    name: '日志安全检查 - 敏感信息',
    run: async () => {
      const content = await readFile(join(ROOT_DIR, 'agent-daemon.py'), 'utf-8');
      const hasSensitiveLog = content.includes('log(f"项目目录: {PROJECT_DIR}")');
      return {
        passed: !hasSensitiveLog,
        message: hasSensitiveLog ? '日志中包含敏感信息' : '已移除敏感信息'
      };
    }
  }
];

// 运行测试
async function runTests() {
  log('\n🧪 运行测试...\n', 'yellow');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.run();
      if (result.passed) {
        log(`  ✅ ${test.name}: ${result.message}`, 'green');
        passed++;
      } else {
        log(`  ❌ ${test.name}: ${result.message}`, 'red');
        failed++;
      }
    } catch (error) {
      log(`  ❌ ${test.name}: ${error.message}`, 'red');
      failed++;
    }
  }
  
  log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`, failed > 0 ? 'red' : 'green');
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  log(`\n❌ 测试运行失败: ${error.message}\n`, 'red');
  process.exit(1);
});