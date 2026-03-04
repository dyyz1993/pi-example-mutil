/**
 * 数据库初始化和连接管理
 * 使用 better-sqlite3 作为 SQLite 数据库
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/coins.db');

// 数据库实例
let db: Database.Database | null = null;

/**
 * 获取数据库连接
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // 确保数据目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    console.log(`[Database] Connected to ${DB_PATH}`);
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
}

/**
 * 初始化数据库表
 */
export function initDatabase(): void {
  const database = getDatabase();
  
  // 用户表
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      balance INTEGER DEFAULT 0,
      frozen_balance INTEGER DEFAULT 0,
      reputation INTEGER DEFAULT 50,
      is_blacklisted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  
  // 订单表
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      buyer_id TEXT,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      freeze_phase INTEGER DEFAULT 1,
      freeze_until TEXT NOT NULL,
      evidence TEXT,
      seller_rating INTEGER,
      buyer_rating INTEGER,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id),
      FOREIGN KEY (buyer_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_freeze_until ON orders(freeze_until);
  `);
  
  // 任务表
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      acceptor_id TEXT,
      reward INTEGER NOT NULL,
      status TEXT DEFAULT 'open',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (acceptor_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_acceptor ON tasks(acceptor_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);
  
  // 空投表
  database.exec(`
    CREATE TABLE IF NOT EXISTS airdrops (
      id TEXT PRIMARY KEY,
      amount INTEGER NOT NULL,
      total_recipients INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS airdrop_recipients (
      id TEXT PRIMARY KEY,
      airdrop_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (airdrop_id) REFERENCES airdrops(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_airdrop_recipients_user ON airdrop_recipients(user_id);
  `);
  
  // 交易记录表
  database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference_id TEXT,
      reference_type TEXT,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  `);
  
  console.log('[Database] Tables initialized');
}

/**
 * 清空所有表数据（仅用于测试）
 */
export function clearDatabase(): void {
  const database = getDatabase();
  database.exec(`
    DELETE FROM transactions;
    DELETE FROM airdrop_recipients;
    DELETE FROM airdrops;
    DELETE FROM tasks;
    DELETE FROM orders;
    DELETE FROM users;
  `);
  console.log('[Database] All tables cleared');
}

// 导出数据库工具对象
export const dbUtils = {
  prepare: (...args: Parameters<Database.Database['prepare']>) => getDatabase().prepare(...args),
  exec: (...args: Parameters<Database.Database['exec']>) => getDatabase().exec(...args),
  transaction: (...args: Parameters<Database.Database['transaction']>) => getDatabase().transaction(...args),
};

export default {
  getDatabase,
  closeDatabase,
  initDatabase,
  clearDatabase,
  dbUtils
};