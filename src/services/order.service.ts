/**
 * 订单服务
 * 实现三阶段冻结机制的 P2P 交易系统
 * 
 * 冻结阶段：
 * - 阶段1: 等待支付 (5分钟) - 买家支付后进入下一阶段，超时自动释放
 * - 阶段2: 已支付待确认 (30分钟) - 卖家确认发货，或买家投诉进入下一阶段
 * - 阶段3: 争议处理 (24小时) - 平台客服介入，双方提交证据
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import type { Order, CreateOrderDTO, OrderStatus, FreezePhase, TRADING_CONFIG } from '../models/index.js';
import { TRADING_CONFIG as config } from '../models/index.js';
import * as userService from './user.service.js';

interface OrderRow {
  id: string;
  seller_id: string;
  buyer_id: string | null;
  amount: number;
  fee: number;
  status: string;
  freeze_phase: number;
  freeze_until: string;
  evidence: string | null;
  seller_rating: number | null;
  buyer_rating: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id || undefined,
    amount: row.amount,
    fee: row.fee,
    status: row.status as OrderStatus,
    freezePhase: row.freeze_phase as FreezePhase,
    freezeUntil: new Date(row.freeze_until),
    evidence: row.evidence ? JSON.parse(row.evidence) : undefined,
    sellerRating: row.seller_rating || undefined,
    buyerRating: row.buyer_rating || undefined,
    description: row.description || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * 计算手续费
 */
function calculateFee(amount: number): number {
  const fee = Math.floor(amount * config.FEE_PERCENTAGE);
  return Math.max(fee, config.MIN_FEE);
}

/**
 * 计算冻结截止时间
 */
function calculateFreezeUntil(phase: FreezePhase): Date {
  const now = new Date();
  return new Date(now.getTime() + config.FREEZE_PHASES[phase]);
}

/**
 * 创建订单
 * 卖家创建订单时冻结其金币
 */
export function createOrder(dto: CreateOrderDTO): Order {
  const db = getDatabase();
  
  // 检查卖家
  const seller = userService.getUserById(dto.sellerId);
  if (!seller) {
    throw new Error('Seller not found');
  }
  
  if (seller.isBlacklisted) {
    throw new Error('Seller is blacklisted');
  }
  
  // 检查交易金额
  if (dto.amount < config.MIN_TRADE_AMOUNT) {
    throw new Error(`Minimum trade amount is ${config.MIN_TRADE_AMOUNT} coins`);
  }
  
  // 检查卖家余额
  const fee = calculateFee(dto.amount);
  const totalDeduction = dto.amount + fee;
  
  if (seller.balance < totalDeduction) {
    throw new Error('Insufficient balance');
  }
  
  const id = uuidv4();
  const now = new Date().toISOString();
  const freezeUntil = calculateFreezeUntil(1);
  
  // 使用事务
  const createTx = db.transaction(() => {
    // 冻结卖家金币
    userService.freezeCoins(dto.sellerId, dto.amount);
    
    // 扣除手续费
    userService.updateBalance(dto.sellerId, -fee);
    
    // 创建订单
    db.prepare(`
      INSERT INTO orders (id, seller_id, amount, fee, status, freeze_phase, freeze_until, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dto.sellerId,
      dto.amount,
      fee,
      'pending',
      1,
      freezeUntil.toISOString(),
      dto.description || null,
      now,
      now
    );
  });
  
  createTx();
  
  return getOrderById(id)!;
}

/**
 * 根据 ID 获取订单
 */
export function getOrderById(id: string): Order | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM orders WHERE id = ?');
  const row = stmt.get(id) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

/**
 * 获取卖家的订单
 */
export function getOrdersBySeller(sellerId: string, limit = 50, offset = 0): Order[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM orders 
    WHERE seller_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(sellerId, limit, offset) as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * 获取买家的订单
 */
export function getOrdersByBuyer(buyerId: string, limit = 50, offset = 0): Order[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM orders 
    WHERE buyer_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(buyerId, limit, offset) as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * 获取开放订单（等待买家）
 */
export function getOpenOrders(limit = 50, offset = 0): Order[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    SELECT * FROM orders 
    WHERE status = 'pending' 
      AND buyer_id IS NULL 
      AND freeze_until > ?
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(now, limit, offset) as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * 买家接单
 * 进入阶段1：等待支付
 */
export function acceptOrder(orderId: string, buyerId: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.status !== 'pending') {
    throw new Error('Order is not available');
  }
  
  if (order.buyerId) {
    throw new Error('Order already has a buyer');
  }
  
  // 检查是否超时
  if (new Date() > order.freezeUntil) {
    // 自动取消超时订单
    cancelOrder(orderId, order.sellerId);
    throw new Error('Order has expired');
  }
  
  // 检查买家
  const buyer = userService.getUserById(buyerId);
  if (!buyer) {
    throw new Error('Buyer not found');
  }
  
  if (buyer.isBlacklisted) {
    throw new Error('Buyer is blacklisted');
  }
  
  // 不能买自己的订单
  if (order.sellerId === buyerId) {
    throw new Error('Cannot buy your own order');
  }
  
  const now = new Date().toISOString();
  const newFreezeUntil = calculateFreezeUntil(1); // 重置等待支付时间
  
  const stmt = db.prepare(`
    UPDATE orders 
    SET buyer_id = ?, freeze_until = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(buyerId, newFreezeUntil.toISOString(), now, orderId);
  
  return getOrderById(orderId)!;
}

/**
 * 买家确认支付
 * 进入阶段2：等待卖家确认
 */
export function confirmPayment(orderId: string, buyerId: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.buyerId !== buyerId) {
    throw new Error('Only buyer can confirm payment');
  }
  
  if (order.status !== 'pending') {
    throw new Error('Order is not in pending status');
  }
  
  // 检查是否超时
  if (new Date() > order.freezeUntil) {
    cancelOrder(orderId, order.sellerId);
    throw new Error('Payment timeout, order cancelled');
  }
  
  const now = new Date().toISOString();
  const newFreezeUntil = calculateFreezeUntil(2);
  
  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'paid', freeze_phase = 2, freeze_until = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(newFreezeUntil.toISOString(), now, orderId);
  
  return getOrderById(orderId)!;
}

/**
 * 卖家确认收款并完成交易
 */
export function confirmOrder(orderId: string, sellerId: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.sellerId !== sellerId) {
    throw new Error('Only seller can confirm order');
  }
  
  if (order.status !== 'paid') {
    throw new Error('Order is not in paid status');
  }
  
  if (!order.buyerId) {
    throw new Error('Order has no buyer');
  }
  
  const now = new Date().toISOString();
  
  // 使用事务完成交易
  const completeTx = db.transaction(() => {
    // 转移冻结的金币给买家（扣除手续费后的金额）
    const netAmount = order.amount - order.fee;
    userService.transferFrozenCoins(order.sellerId, order.buyerId!, netAmount);
    
    // 更新订单状态
    db.prepare(`
      UPDATE orders 
      SET status = 'completed', updated_at = ?
      WHERE id = ?
    `).run(now, orderId);
    
    // 更新双方信誉分
    userService.updateReputation(order.sellerId, 2);
    userService.updateReputation(order.buyerId!, 2);
  });
  
  completeTx();
  
  return getOrderById(orderId)!;
}

/**
 * 发起争议
 * 进入阶段3：争议处理
 */
export function disputeOrder(orderId: string, userId: string, reason: string, evidence: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  // 只有买卖双方可以发起争议
  if (order.sellerId !== userId && order.buyerId !== userId) {
    throw new Error('Only seller or buyer can dispute');
  }
  
  // 只能在 paid 状态下发起争议
  if (order.status !== 'paid') {
    throw new Error('Can only dispute paid orders');
  }
  
  const now = new Date().toISOString();
  const newFreezeUntil = calculateFreezeUntil(3);
  
  // 添加证据
  const evidenceList = [...(order.evidence || []), `${userId}: ${evidence}`];
  
  const stmt = db.prepare(`
    UPDATE orders 
    SET status = 'disputed', freeze_phase = 3, freeze_until = ?, evidence = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(newFreezeUntil.toISOString(), JSON.stringify(evidenceList), now, orderId);
  
  return getOrderById(orderId)!;
}

/**
 * 提交证据（争议阶段）
 */
export function submitEvidence(orderId: string, userId: string, evidence: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.status !== 'disputed') {
    throw new Error('Order is not in disputed status');
  }
  
  // 只有买卖双方可以提交证据
  if (order.sellerId !== userId && order.buyerId !== userId) {
    throw new Error('Only seller or buyer can submit evidence');
  }
  
  const now = new Date().toISOString();
  const evidenceList = [...(order.evidence || []), `${userId}: ${evidence}`];
  
  const stmt = db.prepare(`
    UPDATE orders 
    SET evidence = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(JSON.stringify(evidenceList), now, orderId);
  
  return getOrderById(orderId)!;
}

/**
 * 解决争议（管理员操作）
 */
export function resolveDispute(
  orderId: string, 
  winner: 'seller' | 'buyer' | 'split'
): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.status !== 'disputed') {
    throw new Error('Order is not in disputed status');
  }
  
  if (!order.buyerId) {
    throw new Error('Order has no buyer');
  }
  
  const now = new Date().toISOString();
  const netAmount = order.amount - order.fee;
  
  const resolveTx = db.transaction(() => {
    if (winner === 'seller') {
      // 卖家胜诉，解冻金币给卖家
      userService.unfreezeCoins(order.sellerId, order.amount);
      userService.updateReputation(order.sellerId, 5);
      userService.updateReputation(order.buyerId!, -10);
    } else if (winner === 'buyer') {
      // 买家胜诉，转移金币给买家
      userService.transferFrozenCoins(order.sellerId, order.buyerId!, netAmount);
      userService.updateReputation(order.buyerId!, 5);
      userService.updateReputation(order.sellerId, -10);
    } else {
      // 平分
      const splitAmount = Math.floor(netAmount / 2);
      userService.unfreezeCoins(order.sellerId, splitAmount);
      userService.transferFrozenCoins(order.sellerId, order.buyerId!, splitAmount);
    }
    
    // 更新订单状态
    db.prepare(`
      UPDATE orders 
      SET status = 'completed', updated_at = ?
      WHERE id = ?
    `).run(now, orderId);
  });
  
  resolveTx();
  
  return getOrderById(orderId)!;
}

/**
 * 取消订单
 */
export function cancelOrder(orderId: string, userId: string): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  // 只有卖家可以取消 pending 状态的订单
  // 或者买家超时未支付自动取消
  if (order.status === 'pending' && order.sellerId !== userId) {
    throw new Error('Only seller can cancel pending orders');
  }
  
  // paid 状态下不能直接取消，需要发起争议
  if (order.status === 'paid') {
    throw new Error('Cannot cancel paid orders, please dispute instead');
  }
  
  if (order.status === 'completed' || order.status === 'cancelled') {
    throw new Error('Order already completed or cancelled');
  }
  
  const now = new Date().toISOString();
  
  const cancelTx = db.transaction(() => {
    // 解冻并退还卖家金币
    userService.unfreezeCoins(order.sellerId, order.amount);
    
    // 退还手续费
    userService.updateBalance(order.sellerId, order.fee);
    
    // 更新订单状态
    db.prepare(`
      UPDATE orders 
      SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(now, orderId);
  });
  
  cancelTx();
  
  return getOrderById(orderId)!;
}

/**
 * 评价订单
 */
export function rateOrder(orderId: string, userId: string, rating: number): Order {
  const db = getDatabase();
  const order = getOrderById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (order.status !== 'completed') {
    throw new Error('Can only rate completed orders');
  }
  
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  
  const now = new Date().toISOString();
  
  if (userId === order.sellerId) {
    // 卖家评价买家
    db.prepare(`
      UPDATE orders SET buyer_rating = ?, updated_at = ? WHERE id = ?
    `).run(rating, now, orderId);
    
    // 更新买家信誉
    const reputationDelta = rating >= 4 ? 1 : (rating <= 2 ? -1 : 0);
    userService.updateReputation(order.buyerId!, reputationDelta);
  } else if (userId === order.buyerId) {
    // 买家评价卖家
    db.prepare(`
      UPDATE orders SET seller_rating = ?, updated_at = ? WHERE id = ?
    `).run(rating, now, orderId);
    
    // 更新卖家信誉
    const reputationDelta = rating >= 4 ? 1 : (rating <= 2 ? -1 : 0);
    userService.updateReputation(order.sellerId, reputationDelta);
  } else {
    throw new Error('Only seller or buyer can rate');
  }
  
  return getOrderById(orderId)!;
}

/**
 * 检查并处理超时订单
 * 应由定时任务调用
 */
export function processExpiredOrders(): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // 获取所有超时的订单
  const expiredOrders = db.prepare(`
    SELECT * FROM orders 
    WHERE freeze_until < ? 
      AND status IN ('pending', 'paid', 'disputed')
  `).all(now) as OrderRow[];
  
  let processedCount = 0;
  
  for (const row of expiredOrders) {
    const order = rowToOrder(row);
    
    try {
      if (order.status === 'pending') {
        // 阶段1超时：取消订单，退还卖家
        cancelOrder(order.id, order.sellerId);
        processedCount++;
      } else if (order.status === 'paid') {
        // 阶段2超时：自动确认完成
        confirmOrder(order.id, order.sellerId);
        processedCount++;
      } else if (order.status === 'disputed') {
        // 阶段3超时：平分处理
        resolveDispute(order.id, 'split');
        processedCount++;
      }
    } catch (error) {
      console.error(`Failed to process expired order ${order.id}:`, error);
    }
  }
  
  return processedCount;
}

/**
 * 获取订单统计
 */
export function getOrderStats(userId: string): {
  totalOrders: number;
  asSeller: number;
  asBuyer: number;
  completed: number;
  disputed: number;
} {
  const db = getDatabase();
  
  const asSeller = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE seller_id = ?
  `).get(userId) as { count: number };
  
  const asBuyer = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE buyer_id = ?
  `).get(userId) as { count: number };
  
  const completed = db.prepare(`
    SELECT COUNT(*) as count FROM orders 
    WHERE (seller_id = ? OR buyer_id = ?) AND status = 'completed'
  `).get(userId, userId) as { count: number };
  
  const disputed = db.prepare(`
    SELECT COUNT(*) as count FROM orders 
    WHERE (seller_id = ? OR buyer_id = ?) AND status = 'disputed'
  `).get(userId, userId) as { count: number };
  
  return {
    totalOrders: asSeller.count + asBuyer.count,
    asSeller: asSeller.count,
    asBuyer: asBuyer.count,
    completed: completed.count,
    disputed: disputed.count
  };
}

export default {
  createOrder,
  getOrderById,
  getOrdersBySeller,
  getOrdersByBuyer,
  getOpenOrders,
  acceptOrder,
  confirmPayment,
  confirmOrder,
  disputeOrder,
  submitEvidence,
  resolveDispute,
  cancelOrder,
  rateOrder,
  processExpiredOrders,
  getOrderStats
};