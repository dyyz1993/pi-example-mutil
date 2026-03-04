/**
 * 数据库种子数据
 */

import { db, closeDatabase } from './index.js';
import { v4 as uuidv4 } from 'uuid';

console.log('🌱 Seeding database...');

try {
  // 创建测试用户
  const users = [
    { id: uuidv4(), username: 'alice', email: 'alice@example.com', balance: 10000 },
    { id: uuidv4(), username: 'bob', email: 'bob@example.com', balance: 5000 },
    { id: uuidv4(), username: 'charlie', email: 'charlie@example.com', balance: 3000 },
    { id: uuidv4(), username: 'merchant', email: 'merchant@example.com', balance: 50000 },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, email, balance, frozen_balance, reputation)
    VALUES (?, ?, ?, ?, 0, 50)
  `);

  for (const user of users) {
    insertUser.run(user.id, user.username, user.email, user.balance);
    console.log(`  ✓ Created user: ${user.username} (${user.balance} coins)`);
  }

  // 创建测试任务
  const tasks = [
    {
      id: uuidv4(),
      creator_id: users[0].id,
      title: '翻译一篇技术文档',
      description: '需要将一篇5000字的英文技术文档翻译成中文',
      reward: 500,
    },
    {
      id: uuidv4(),
      creator_id: users[1].id,
      title: '设计一个Logo',
      description: '为我的新项目设计一个简洁的Logo',
      reward: 1000,
    },
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, creator_id, title, description, reward, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `);

  for (const task of tasks) {
    insertTask.run(task.id, task.creator_id, task.title, task.description, task.reward);
    console.log(`  ✓ Created task: ${task.title}`);
  }

  console.log('✅ Seeding completed successfully');
} catch (error) {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
} finally {
  closeDatabase();
}