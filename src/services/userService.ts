/**
 * 用户服务
 * 处理用户注册、登录、余额管理等功能
 */

import {
  User,
  UserBalance,
  Transaction,
  TransactionType,
  FrozenRecord,
  FreezeReason
} from '../types';

// 模拟数据库存储
const users: Map<string, User> = new Map();
const transactions: Map<string, Transaction[]> = new Map();
const frozenRecords: Map<string, FrozenRecord[]> = new Map();

export class UserService {
  /**
   * 创建用户
   */
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'coins' | 'frozenCoins' | 'reputation'>): Promise<User> {
    const userId = this.generateId();
    const now = new Date();
    
    const user: User = {
      id: userId,
      ...userData,
      coins: 0,
      frozenCoins: 0,
      reputation: 100, // 初始信用分
      createdAt: now,
      updatedAt: now
    };
    
    users.set(userId, user);
    transactions.set(userId, []);
    frozenRecords.set(userId, []);
    
    return user;
  }

  /**
   * 获取用户信息
   */
  async getUser(userId: string): Promise<User | null> {
    return users.get(userId) || null;
  }

  /**
   * 获取用户余额
   */
  async getUserBalance(userId: string): Promise<UserBalance | null> {
    const user = users.get(userId);
    if (!user) return null;
    
    return {
      userId: user.id,
      availableCoins: user.coins,
      frozenCoins: user.frozenCoins,
      totalCoins: user.coins + user.frozenCoins
    };
  }

  /**
   * 增加用户金币
   */
  async addCoins(userId: string, amount: number, type: TransactionType, description: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) return false;
    
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    user.coins += amount;
    user.updatedAt = new Date();
    
    // 记录交易
    await this.recordTransaction(userId, type, amount, user.coins, description);
    
    return true;
  }

  /**
   * 扣除用户金币
   */
  async deductCoins(userId: string, amount: number, type: TransactionType, description: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) return false;
    
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    if (user.coins < amount) {
      throw new Error('Insufficient balance');
    }
    
    user.coins -= amount;
    user.updatedAt = new Date();
    
    // 记录交易（负数表示扣除）
    await this.recordTransaction(userId, type, -amount, user.coins, description);
    
    return true;
  }

  /**
   * 冻结用户金币
   */
  async freezeCoins(userId: string, amount: number, reason: FreezeReason, relatedTradeId?: string): Promise<FrozenRecord> {
    const user = users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    if (user.coins < amount) {
      throw new Error('Insufficient balance');
    }
    
    // 从可用余额转移到冻结余额
    user.coins -= amount;
    user.frozenCoins += amount;
    user.updatedAt = new Date();
    
    // 创建冻结记录
    const frozenRecord: FrozenRecord = {
      id: this.generateId(),
      userId,
      amount,
      reason,
      relatedTradeId,
      frozenAt: new Date(),
      status: 'FROZEN'
    };
    
    const userFrozenRecords = frozenRecords.get(userId) || [];
    userFrozenRecords.push(frozenRecord);
    frozenRecords.set(userId, userFrozenRecords);
    
    // 记录交易
    await this.recordTransaction(userId, TransactionType.FREEZE, -amount, user.coins, `冻结原因: ${reason}`);
    
    return frozenRecord;
  }

  /**
   * 解冻用户金币
   */
  async unfreezeCoins(userId: string, frozenRecordId: string, notes?: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const userFrozenRecords = frozenRecords.get(userId) || [];
    const frozenRecord = userFrozenRecords.find(r => r.id === frozenRecordId && r.status === 'FROZEN');
    
    if (!frozenRecord) {
      throw new Error('Frozen record not found or already unfrozen');
    }
    
    // 从冻结余额转移到可用余额
    user.frozenCoins -= frozenRecord.amount;
    user.coins += frozenRecord.amount;
    user.updatedAt = new Date();
    
    // 更新冻结记录
    frozenRecord.status = 'UNFROZEN';
    frozenRecord.unfrozenAt = new Date();
    frozenRecord.notes = notes;
    
    // 记录交易
    await this.recordTransaction(userId, TransactionType.UNFREEZE, frozenRecord.amount, user.coins, `解冻: ${notes || '正常解冻'}`);
    
    return true;
  }

  /**
   * 没收冻结的金币（用于违规处理）
   */
  async confiscateFrozenCoins(userId: string, frozenRecordId: string, reason: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const userFrozenRecords = frozenRecords.get(userId) || [];
    const frozenRecord = userFrozenRecords.find(r => r.id === frozenRecordId && r.status === 'FROZEN');
    
    if (!frozenRecord) {
      throw new Error('Frozen record not found or already unfrozen');
    }
    
    // 直接扣除冻结余额
    user.frozenCoins -= frozenRecord.amount;
    user.updatedAt = new Date();
    
    // 更新冻结记录
    frozenRecord.status = 'UNFROZEN';
    frozenRecord.unfrozenAt = new Date();
    frozenRecord.notes = `已没收: ${reason}`;
    
    // 记录交易（不增加可用余额）
    await this.recordTransaction(userId, TransactionType.WITHDRAW, 0, user.coins, `没收冻结金币: ${reason}`);
    
    // 降低信用分
    user.reputation = Math.max(0, user.reputation - 10);
    
    return true;
  }

  /**
   * 获取冻结记录
   */
  async getFrozenRecords(userId: string): Promise<FrozenRecord[]> {
    const userFrozenRecords = frozenRecords.get(userId) || [];
    return userFrozenRecords.filter(r => r.status === 'FROZEN');
  }

  /**
   * 获取交易记录
   */
  async getTransactions(userId: string, page: number = 1, pageSize: number = 20): Promise<Transaction[]> {
    const userTransactions = transactions.get(userId) || [];
    const start = (page - 1) * pageSize;
    return userTransactions.slice(start, start + pageSize);
  }

  /**
   * 更新用户信用分
   */
  async updateReputation(userId: string, delta: number): Promise<boolean> {
    const user = users.get(userId);
    if (!user) return false;
    
    user.reputation = Math.max(0, Math.min(1000, user.reputation + delta));
    user.updatedAt = new Date();
    
    return true;
  }

  /**
   * 检查用户是否有足够可用余额
   */
  async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
    const user = users.get(userId);
    if (!user) return false;
    return user.coins >= amount;
  }

  /**
   * 记录交易
   */
  private async recordTransaction(userId: string, type: TransactionType, amount: number, balanceAfter: number, description: string): Promise<void> {
    const transaction: Transaction = {
      id: this.generateId(),
      userId,
      type,
      amount,
      balanceAfter,
      description,
      createdAt: new Date()
    };
    
    const userTransactions = transactions.get(userId) || [];
    userTransactions.push(transaction);
    transactions.set(userId, userTransactions);
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例
export const userService = new UserService();