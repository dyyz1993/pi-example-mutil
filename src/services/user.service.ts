/**
 * 用户服务
 * 处理用户金币余额、冻结、信誉分等
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import type { User, CreateUserDTO, TRADING_CONFIG } from '../models/index.js';
import { TRADING_CONFIG as config } from '../models/index.js';

interface UserRow {
  id: string;
  username: string;
  email: string;
  balance: number;
  frozen_balance: number;
  reputation: number;
  is_blacklisted: number;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    balance: row.balance,
    frozenBalance: row.frozen_balance,
    reputation: row.reputation,
    isBlacklisted: row.is_blacklisted === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * 创建用户
 */
export function createUser(dto: CreateUserDTO): User {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO users (id, username, email, balance, frozen_balance, reputation, is_blacklisted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    dto.username,
    dto.email,
    config.INITIAL_BALANCE,
    0,
    config.INITIAL_REPUTATION,
    0,
    now,
    now
  );
  
  return getUserById(id)!;
}

/**
 * 根据 ID 获取用户
 */
export function getUserById(id: string): User | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

/**
 * 根据用户名获取用户
 */
export function getUserByUsername(username: string): User | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const row = stmt.get(username) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

/**
 * 根据邮箱获取用户
 */
export function getUserByEmail(email: string): User | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const row = stmt.get(email) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

/**
 * 获取所有用户
 */
export function getAllUsers(limit = 100, offset = 0): User[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?');
  const rows = stmt.all(limit, offset) as UserRow[];
  return rows.map(rowToUser);
}

/**
 * 更新用户余额（内部方法）
 */
export function updateBalance(userId: string, delta: number): User | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) return null;
  
  const newBalance = user.balance + delta;
  if (newBalance < 0) {
    throw new Error('Insufficient balance');
  }
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users SET balance = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(newBalance, now, userId);
  
  // 记录交易
  recordTransaction(userId, delta > 0 ? 'credit' : 'debit', Math.abs(delta), newBalance);
  
  return getUserById(userId);
}

/**
 * 冻结金币
 */
export function freezeCoins(userId: string, amount: number): User | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) return null;
  
  if (user.balance < amount) {
    throw new Error('Insufficient balance to freeze');
  }
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users SET balance = ?, frozen_balance = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(user.balance - amount, user.frozenBalance + amount, now, userId);
  
  return getUserById(userId);
}

/**
 * 解冻金币
 */
export function unfreezeCoins(userId: string, amount: number): User | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) return null;
  
  if (user.frozenBalance < amount) {
    throw new Error('Insufficient frozen balance');
  }
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users SET balance = ?, frozen_balance = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(user.balance + amount, user.frozenBalance - amount, now, userId);
  
  return getUserById(userId);
}

/**
 * 转移金币（从冻结余额）
 */
export function transferFrozenCoins(fromUserId: string, toUserId: string, amount: number): { from: User; to: User } | null {
  const db = getDatabase();
  const fromUser = getUserById(fromUserId);
  const toUser = getUserById(toUserId);
  
  if (!fromUser || !toUser) return null;
  
  if (fromUser.frozenBalance < amount) {
    throw new Error('Insufficient frozen balance');
  }
  
  const now = new Date().toISOString();
  
  // 使用事务确保原子性
  const transfer = db.transaction(() => {
    // 从卖家冻结余额扣除
    db.prepare(`
      UPDATE users SET frozen_balance = ?, updated_at = ? WHERE id = ?
    `).run(fromUser.frozenBalance - amount, now, fromUserId);
    
    // 增加买家余额
    db.prepare(`
      UPDATE users SET balance = ?, updated_at = ? WHERE id = ?
    `).run(toUser.balance + amount, now, toUserId);
    
    // 记录交易
    recordTransaction(fromUserId, 'debit', amount, fromUser.frozenBalance - amount, 'order_transfer');
    recordTransaction(toUserId, 'credit', amount, toUser.balance + amount, 'order_receive');
  });
  
  transfer();
  
  return {
    from: getUserById(fromUserId)!,
    to: getUserById(toUserId)!
  };
}

/**
 * 更新用户信誉分
 */
export function updateReputation(userId: string, delta: number): User | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) return null;
  
  const newReputation = Math.max(0, Math.min(100, user.reputation + delta));
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE users SET reputation = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(newReputation, now, userId);
  
  return getUserById(userId);
}

/**
 * 设置黑名单状态
 */
export function setBlacklisted(userId: string, blacklisted: boolean): User | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) return null;
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users SET is_blacklisted = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(blacklisted ? 1 : 0, now, userId);
  
  return getUserById(userId);
}

/**
 * 记录交易
 */
function recordTransaction(
  userId: string, 
  type: string, 
  amount: number, 
  balanceAfter: number,
  referenceType?: string
): void {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO transactions (id, user_id, type, amount, balance_after, reference_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, type, amount, balanceAfter, referenceType || null, now);
}

export default {
  createUser,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  getAllUsers,
  updateBalance,
  freezeCoins,
  unfreezeCoins,
  transferFrozenCoins,
  updateReputation,
  setBlacklisted
};