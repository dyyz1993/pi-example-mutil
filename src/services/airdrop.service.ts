/**
 * 空投服务
 * 处理平台空投功能
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import type { Airdrop, AirdropRecipient } from '../models/index.js';
import * as userService from './user.service.js';

interface AirdropRow {
  id: string;
  amount: number;
  total_recipients: number;
  created_at: string;
}

interface AirdropRecipientRow {
  id: string;
  airdrop_id: string;
  user_id: string;
  amount: number;
  received_at: string;
}

function rowToAirdrop(row: AirdropRow): Airdrop {
  return {
    id: row.id,
    amount: row.amount,
    totalRecipients: row.total_recipients,
    createdAt: new Date(row.created_at)
  };
}

function rowToAirdropRecipient(row: AirdropRecipientRow): AirdropRecipient {
  return {
    id: row.id,
    airdropId: row.airdrop_id,
    userId: row.user_id,
    amount: row.amount,
    receivedAt: new Date(row.received_at)
  };
}

/**
 * 创建空投并分发给所有用户
 */
export function createAirdrop(amount: number, userIds?: string[]): Airdrop {
  const db = getDatabase();
  
  // 获取目标用户
  let targetUsers: string[];
  
  if (userIds && userIds.length > 0) {
    targetUsers = userIds;
  } else {
    // 分发给所有非黑名单用户
    const users = userService.getAllUsers(10000);
    targetUsers = users
      .filter(u => !u.isBlacklisted)
      .map(u => u.id);
  }
  
  if (targetUsers.length === 0) {
    throw new Error('No eligible users for airdrop');
  }
  
  const airdropId = uuidv4();
  const now = new Date().toISOString();
  
  const airdropTx = db.transaction(() => {
    // 创建空投记录
    db.prepare(`
      INSERT INTO airdrops (id, amount, total_recipients, created_at)
      VALUES (?, ?, ?, ?)
    `).run(airdropId, amount, targetUsers.length, now);
    
    // 为每个用户添加金币
    const insertRecipient = db.prepare(`
      INSERT INTO airdrop_recipients (id, airdrop_id, user_id, amount, received_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const userId of targetUsers) {
      const recipientId = uuidv4();
      insertRecipient.run(recipientId, airdropId, userId, amount, now);
      
      // 增加用户余额
      userService.updateBalance(userId, amount);
    }
  });
  
  airdropTx();
  
  return {
    id: airdropId,
    amount,
    totalRecipients: targetUsers.length,
    createdAt: new Date(now)
  };
}

/**
 * 根据 ID 获取空投
 */
export function getAirdropById(id: string): Airdrop | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM airdrops WHERE id = ?');
  const row = stmt.get(id) as AirdropRow | undefined;
  return row ? rowToAirdrop(row) : null;
}

/**
 * 获取用户收到的空投
 */
export function getAirdropsByUser(userId: string, limit = 50, offset = 0): AirdropRecipient[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM airdrop_recipients 
    WHERE user_id = ? 
    ORDER BY received_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(userId, limit, offset) as AirdropRecipientRow[];
  return rows.map(rowToAirdropRecipient);
}

/**
 * 获取所有空投记录
 */
export function getAllAirdrops(limit = 50, offset = 0): Airdrop[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM airdrops 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(limit, offset) as AirdropRow[];
  return rows.map(rowToAirdrop);
}

export default {
  createAirdrop,
  getAirdropById,
  getAirdropsByUser,
  getAllAirdrops
};