/**
 * 交易服务
 * 处理 P2P 交易的核心逻辑，包括交易创建、付款确认、金币释放等
 */

import {
  Trade,
  TradeStatus,
  Order,
  OrderType,
  OrderStatus,
  PaymentMethod,
  TradeDispute,
  FreezeReason,
  TransactionType
} from '../types';
import { userService } from './userService';
import { orderService } from './orderService';

// 模拟数据库存储
const trades: Map<string, Trade> = new Map();
const disputes: Map<string, TradeDispute[]> = new Map();

// 交易超时设置
const PAYMENT_TIMEOUT_MINUTES = 30; // 付款超时
const CONFIRMATION_TIMEOUT_MINUTES = 60; // 确认超时

export class TradeService {
  /**
   * 发起交易
   * 买方点击买单或卖方点击卖单
   */
  async initiateTrade(
    orderId: string,
    traderId: string,
    amount: number,
    selectedPaymentMethod: PaymentMethod
  ): Promise<Trade> {
    // 获取订单
    const order = await orderService.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // 验证订单状态
    const canTrade = await orderService.canTrade(orderId, amount);
    if (!canTrade.canTrade) {
      throw new Error(canTrade.reason);
    }

    // 确定买卖双方
    let buyerId: string;
    let sellerId: string;

    if (order.type === OrderType.BUY) {
      // 订单是买单，订单创建者是买家
      buyerId = order.userId;
      sellerId = traderId;
    } else {
      // 订单是卖单，订单创建者是卖家
      buyerId = traderId;
      sellerId = order.userId;
    }

    // 不能和自己交易
    if (buyerId === sellerId) {
      throw new Error('Cannot trade with yourself');
    }

    // 验证支付方式
    const validPayment = order.paymentMethods.find(
      pm => pm.type === selectedPaymentMethod.type
    );
    if (!validPayment) {
      throw new Error('Payment method not supported by this order');
    }

    // 如果是卖单，需要冻结卖家的金币
    let frozenRecordId: string | undefined;
    if (order.type === OrderType.SELL) {
      // 卖家是订单创建者
      const hasBalance = await userService.hasEnoughBalance(sellerId, amount);
      if (!hasBalance) {
        throw new Error('Seller does not have enough coins');
      }
      
      const frozenRecord = await userService.freezeCoins(
        sellerId,
        amount,
        FreezeReason.TRADE_ESCROW,
        undefined // 将在交易创建后更新
      );
      frozenRecordId = frozenRecord.id;
    }

    // 更新订单状态
    await orderService.updateOrderStatus(orderId, OrderStatus.PROCESSING);

    // 创建交易
    const now = new Date();
    const trade: Trade = {
      id: this.generateId(),
      orderId,
      buyerId,
      sellerId,
      amount,
      price: order.price,
      totalPrice: amount * order.price,
      status: TradeStatus.PENDING,
      paymentMethod: selectedPaymentMethod,
      frozenAmount: order.type === OrderType.SELL ? amount : 0,
      createdAt: now,
      updatedAt: now
    };

    trades.set(trade.id, trade);
    disputes.set(trade.id, []);

    return trade;
  }

  /**
   * 买方确认已付款
   */
  async confirmPayment(tradeId: string, userId: string): Promise<Trade> {
    const trade = trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    // 只有买方能确认付款
    if (trade.buyerId !== userId) {
      throw new Error('Only buyer can confirm payment');
    }

    // 检查交易状态
    if (trade.status !== TradeStatus.PENDING) {
      throw new Error(`Cannot confirm payment in ${trade.status} status`);
    }

    // 检查是否超时
    const paymentDeadline = new Date(trade.createdAt.getTime() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
    if (new Date() > paymentDeadline) {
      await this.cancelTrade(tradeId, userId, 'Payment timeout');
      throw new Error('Payment timeout, trade has been cancelled');
    }

    trade.status = TradeStatus.PAID;
    trade.paidAt = new Date();
    trade.updatedAt = new Date();

    return trade;
  }

  /**
   * 卖方确认收款并释放金币
   */
  async confirmReceiptAndRelease(tradeId: string, userId: string): Promise<Trade> {
    const trade = trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    // 只有卖方能确认收款
    if (trade.sellerId !== userId) {
      throw new Error('Only seller can confirm receipt');
    }

    // 检查交易状态
    if (trade.status !== TradeStatus.PAID) {
      throw new Error(`Cannot confirm receipt in ${trade.status} status`);
    }

    // 解冻并转移金币给买方
    const frozenRecords = await userService.getFrozenRecords(trade.sellerId);
    const relatedFrozen = frozenRecords.find(r => r.relatedTradeId === tradeId);
    
    if (relatedFrozen) {
      // 解冻后直接转给买方
      await userService.unfreezeCoins(trade.sellerId, relatedFrozen.id, `Trade ${tradeId} completed`);
    }

    // 给买方增加金币
    await userService.addCoins(
      trade.buyerId,
      trade.amount,
      TransactionType.BUY,
      `Purchased from trade ${tradeId}`
    );

    // 更新交易状态
    trade.status = TradeStatus.COMPLETED;
    trade.completedAt = new Date();
    trade.updatedAt = new Date();

    // 更新订单状态和数量
    await orderService.reduceOrderAmount(trade.orderId, trade.amount);

    // 更新信用分
    await userService.updateReputation(trade.buyerId, 1);
    await userService.updateReputation(trade.sellerId, 1);

    return trade;
  }

  /**
   * 取消交易
   */
  async cancelTrade(tradeId: string, userId: string, reason?: string): Promise<Trade> {
    const trade = trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    // 只有买卖双方能取消
    if (trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new Error('Only buyer or seller can cancel the trade');
    }

    // 检查交易状态
    if (trade.status !== TradeStatus.PENDING && trade.status !== TradeStatus.PAID) {
      throw new Error(`Cannot cancel trade in ${trade.status} status`);
    }

    // 如果已付款，不能直接取消，需要发起争议
    if (trade.status === TradeStatus.PAID) {
      throw new Error('Cannot cancel after payment, please open a dispute');
    }

    // 解冻卖家的金币（如果有冻结）
    if (trade.frozenAmount > 0) {
      const frozenRecords = await userService.getFrozenRecords(trade.sellerId);
      const relatedFrozen = frozenRecords.find(r => r.relatedTradeId === tradeId);
      
      if (relatedFrozen) {
        await userService.unfreezeCoins(trade.sellerId, relatedFrozen.id, `Trade ${tradeId} cancelled: ${reason}`);
      }
    }

    // 更新交易状态
    trade.status = TradeStatus.CANCELLED;
    trade.updatedAt = new Date();

    // 恢复订单状态
    await orderService.updateOrderStatus(trade.orderId, OrderStatus.PENDING);

    return trade;
  }

  /**
   * 发起争议
   */
  async openDispute(
    tradeId: string,
    reporterId: string,
    reason: string,
    description: string
  ): Promise<TradeDispute> {
    const trade = trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    // 只有买卖双方能发起争议
    if (trade.buyerId !== reporterId && trade.sellerId !== reporterId) {
      throw new Error('Only buyer or seller can open a dispute');
    }

    // 检查交易状态
    if (trade.status === TradeStatus.COMPLETED || trade.status === TradeStatus.CANCELLED) {
      throw new Error('Cannot open dispute on completed or cancelled trade');
    }

    // 创建争议记录
    const dispute: TradeDispute = {
      id: this.generateId(),
      tradeId,
      reporterId,
      reason,
      description,
      status: 'PENDING',
      createdAt: new Date()
    };

    const tradeDisputes = disputes.get(tradeId) || [];
    tradeDisputes.push(dispute);
    disputes.set(tradeId, tradeDisputes);

    // 更新交易状态
    trade.status = TradeStatus.DISPUTED;
    trade.updatedAt = new Date();

    return dispute;
  }

  /**
   * 解决争议（管理员操作）
   */
  async resolveDispute(
    tradeId: string,
    disputeId: string,
    resolution: 'BUYER_WINS' | 'SELLER_WINS' | 'SPLIT',
    notes: string
  ): Promise<Trade> {
    const trade = trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    const tradeDisputes = disputes.get(tradeId) || [];
    const dispute = tradeDisputes.find(d => d.id === disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // 解冻并分配金币
    const frozenRecords = await userService.getFrozenRecords(trade.sellerId);
    const relatedFrozen = frozenRecords.find(r => r.relatedTradeId === tradeId);

    switch (resolution) {
      case 'BUYER_WINS':
        // 买方获胜，金币给买方
        if (relatedFrozen) {
          await userService.unfreezeCoins(trade.sellerId, relatedFrozen.id, `Dispute resolved: buyer wins`);
        }
        await userService.addCoins(
          trade.buyerId,
          trade.amount,
          TransactionType.BUY,
          `Dispute resolved in favor: ${notes}`
        );
        await userService.updateReputation(trade.sellerId, -10);
        break;

      case 'SELLER_WINS':
        // 卖方获胜，金币退还给卖方
        if (relatedFrozen) {
          await userService.unfreezeCoins(trade.sellerId, relatedFrozen.id, `Dispute resolved: seller wins`);
        }
        await userService.updateReputation(trade.buyerId, -10);
        break;

      case 'SPLIT':
        // 平分
        if (relatedFrozen) {
          await userService.unfreezeCoins(trade.sellerId, relatedFrozen.id, `Dispute resolved: split`);
        }
        const halfAmount = Math.floor(trade.amount / 2);
        await userService.addCoins(
          trade.sellerId,
          halfAmount,
          TransactionType.REFUND,
          `Dispute split refund: ${notes}`
        );
        await userService.addCoins(
          trade.buyerId,
          trade.amount - halfAmount,
          TransactionType.BUY,
          `Dispute split: ${notes}`
        );
        break;
    }

    // 更新争议状态
    dispute.status = 'RESOLVED';
    dispute.resolution = notes;
    dispute.resolvedAt = new Date();

    // 更新交易状态
    trade.status = TradeStatus.COMPLETED;
    trade.completedAt = new Date();
    trade.updatedAt = new Date();

    return trade;
  }

  /**
   * 获取交易详情
   */
  async getTrade(tradeId: string): Promise<Trade | null> {
    return trades.get(tradeId) || null;
  }

  /**
   * 获取用户的交易列表
   */
  async getUserTrades(userId: string): Promise<Trade[]> {
    const userTrades: Trade[] = [];
    
    for (const trade of trades.values()) {
      if (trade.buyerId === userId || trade.sellerId === userId) {
        userTrades.push(trade);
      }
    }

    return userTrades.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 获取交易的争议列表
   */
  async getTradeDisputes(tradeId: string): Promise<TradeDispute[]> {
    return disputes.get(tradeId) || [];
  }

  /**
   * 自动取消超时交易（定时任务调用）
   */
  async cancelTimeoutTrades(): Promise<number> {
    let cancelledCount = 0;
    const now = new Date();

    for (const trade of trades.values()) {
      if (trade.status === TradeStatus.PENDING) {
        const deadline = new Date(trade.createdAt.getTime() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
        if (now > deadline) {
          await this.cancelTrade(trade.id, trade.buyerId, 'Auto cancelled: payment timeout');
          cancelledCount++;
        }
      }
    }

    return cancelledCount;
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例
export const tradeService = new TradeService();