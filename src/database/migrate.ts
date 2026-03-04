/**
 * 数据库迁移脚本
 */

import { initDatabase, closeDatabase } from './index.js';

console.log('🔄 Running database migrations...');

try {
  initDatabase();
  console.log('✅ Migrations completed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  closeDatabase();
}