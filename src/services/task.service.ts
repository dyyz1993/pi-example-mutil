/**
 * 任务服务
 * 处理任务发布、接受、完成等
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import type { Task, CreateTaskDTO, TaskStatus } from '../models/index.js';
import * as userService from './user.service.js';

interface TaskRow {
  id: string;
  creator_id: string;
  acceptor_id: string | null;
  reward: number;
  status: string;
  title: string;
  description: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    creatorId: row.creator_id,
    acceptorId: row.acceptor_id || undefined,
    reward: row.reward,
    status: row.status as TaskStatus,
    title: row.title,
    description: row.description,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * 创建任务
 */
export function createTask(dto: CreateTaskDTO): Task {
  const db = getDatabase();
  
  // 检查创建者
  const creator = userService.getUserById(dto.creatorId);
  if (!creator) {
    throw new Error('Creator not found');
  }
  
  if (creator.isBlacklisted) {
    throw new Error('Creator is blacklisted');
  }
  
  // 检查余额是否足够支付悬赏
  if (creator.balance < dto.reward) {
    throw new Error('Insufficient balance for reward');
  }
  
  // 冻结悬赏金币
  userService.freezeCoins(dto.creatorId, dto.reward);
  
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO tasks (id, creator_id, reward, status, title, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    dto.creatorId,
    dto.reward,
    'open',
    dto.title,
    dto.description,
    now,
    now
  );
  
  return getTaskById(id)!;
}

/**
 * 根据 ID 获取任务
 */
export function getTaskById(id: string): Task | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const row = stmt.get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

/**
 * 获取开放的任务列表
 */
export function getOpenTasks(limit = 50, offset = 0): Task[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE status = 'open' 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(limit, offset) as TaskRow[];
  return rows.map(rowToTask);
}

/**
 * 获取用户创建的任务
 */
export function getTasksByCreator(creatorId: string, limit = 50, offset = 0): Task[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE creator_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(creatorId, limit, offset) as TaskRow[];
  return rows.map(rowToTask);
}

/**
 * 获取用户接受的任务
 */
export function getTasksByAcceptor(acceptorId: string, limit = 50, offset = 0): Task[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE acceptor_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(acceptorId, limit, offset) as TaskRow[];
  return rows.map(rowToTask);
}

/**
 * 接受任务
 */
export function acceptTask(taskId: string, acceptorId: string): Task {
  const db = getDatabase();
  const task = getTaskById(taskId);
  
  if (!task) {
    throw new Error('Task not found');
  }
  
  if (task.status !== 'open') {
    throw new Error('Task is not open for acceptance');
  }
  
  // 检查接受者
  const acceptor = userService.getUserById(acceptorId);
  if (!acceptor) {
    throw new Error('Acceptor not found');
  }
  
  if (acceptor.isBlacklisted) {
    throw new Error('Acceptor is blacklisted');
  }
  
  // 不能接受自己创建的任务
  if (task.creatorId === acceptorId) {
    throw new Error('Cannot accept your own task');
  }
  
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE tasks 
    SET acceptor_id = ?, status = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(acceptorId, 'in_progress', now, taskId);
  
  return getTaskById(taskId)!;
}

/**
 * 完成任务（由创建者确认）
 */
export function completeTask(taskId: string, creatorId: string): Task {
  const db = getDatabase();
  const task = getTaskById(taskId);
  
  if (!task) {
    throw new Error('Task not found');
  }
  
  if (task.creatorId !== creatorId) {
    throw new Error('Only creator can complete the task');
  }
  
  if (task.status !== 'in_progress') {
    throw new Error('Task is not in progress');
  }
  
  if (!task.acceptorId) {
    throw new Error('Task has no acceptor');
  }
  
  const now = new Date().toISOString();
  
  const completeTx = db.transaction(() => {
    // 转移冻结的金币给接受者
    userService.transferFrozenCoins(task.creatorId, task.acceptorId!, task.reward);
    
    // 更新任务状态
    db.prepare(`
      UPDATE tasks 
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run('completed', now, now, taskId);
  });
  
  completeTx();
  
  return getTaskById(taskId)!;
}

/**
 * 取消任务
 */
export function cancelTask(taskId: string, creatorId: string): Task {
  const db = getDatabase();
  const task = getTaskById(taskId);
  
  if (!task) {
    throw new Error('Task not found');
  }
  
  if (task.creatorId !== creatorId) {
    throw new Error('Only creator can cancel the task');
  }
  
  if (task.status === 'completed') {
    throw new Error('Cannot cancel completed task');
  }
  
  const now = new Date().toISOString();
  
  const cancelTx = db.transaction(() => {
    // 释放冻结的金币
    userService.unfreezeCoins(task.creatorId, task.reward);
    
    // 更新任务状态
    db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
    `).run('cancelled', now, taskId);
  });
  
  cancelTx();
  
  return getTaskById(taskId)!;
}

/**
 * 放弃任务（由接受者放弃）
 */
export function abandonTask(taskId: string, acceptorId: string): Task {
  const db = getDatabase();
  const task = getTaskById(taskId);
  
  if (!task) {
    throw new Error('Task not found');
  }
  
  if (task.acceptorId !== acceptorId) {
    throw new Error('Only acceptor can abandon the task');
  }
  
  if (task.status !== 'in_progress') {
    throw new Error('Task is not in progress');
  }
  
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE tasks 
    SET acceptor_id = NULL, status = 'open', updated_at = ?
    WHERE id = ?
  `);
  stmt.run(now, taskId);
  
  return getTaskById(taskId)!;
}

export default {
  createTask,
  getTaskById,
  getOpenTasks,
  getTasksByCreator,
  getTasksByAcceptor,
  acceptTask,
  completeTask,
  cancelTask,
  abandonTask
};