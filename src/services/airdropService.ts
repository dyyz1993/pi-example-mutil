/**
 * 空投服务
 */

import { getDatabase } from '../database/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as userService from './user.service.js';
import type { Transaction } from '../types/models.js';
import type { TransactionListResponse } from '../types/api.js';

/**
 * 空投金币给用户
 */
export function airdrop(userId: string, amount: number, description = '系统空投'): boolean {
  const db = getDatabase();
  
  const transaction = db.transaction(() => {
    // 增加用户余额
    const user = userService.updateBalance(userId, amount);
    if (!user) return false;

    // 记录交易
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, balance_after, description, created_at)
      VALUES (?, ?, 'airdrop', ?, ?, ?, datetime('now'))
    `);
    stmt.run(id, userId, amount, user.balance, description);

    return true;
  });

  return transaction();
}

/**
 * 批量空投
 */
export function batchAirdrop(userIds: string[], amount: number): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    if (airdrop(userId, amount, '批量空投')) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * 给所有用户空投
 */
export function airdropAll(amount: number): { success: number; failed: number } {
  const db = getDatabase();
  const users = db.prepare('SELECT id FROM users WHERE is_blacklisted = 0').all() as { id: string }[];
  return batchAirdrop(users.map(u => u.id), amount);
}

/**
 * 获取用户交易记录
 */
export function getTransactionsByUserId(userId: string, options: { page?: number; pageSize?: number } = {}): TransactionListResponse {
  const db = getDatabase();
  const { page = 1, pageSize = 20 } = options;
  const offset = (page - 1) * pageSize;

  // 获取总数
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM transactions 
    WHERE user_id = ?
  `);
  const countResult = countStmt.get(userId) as { total: number };
  const total = countResult.total;

  // 获取列表
  const listStmt = db.prepare(`
    SELECT * FROM transactions 
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `);
  const rows = listStmt.all(userId, pageSize, offset) as Transaction[];

  return {
    transactions: rows.map(t => ({
      id: t.id,
      from_user_id: null,
      to_user_id: t.user_id,
      amount: t.amount,
      type: t.type,
      reference_id: t.reference_id || null,
      description: t.description,
      created_at: t.created_at,
    })),
    total,
    page,
    page_size: pageSize,
  };
}

export default {
  airdrop,
  batchAirdrop,
  airdropAll,
  getTransactionsByUserId
};