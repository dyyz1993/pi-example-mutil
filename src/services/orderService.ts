/**
 * 订单服务
 * 处理 P2P 交易订单的创建、查询、取消等功能
 */

import {
  Order,
  OrderType,
  OrderStatus,
  PaymentMethod,
  ApiResponse,
  PaginatedResponse
} from '../types';

// 模拟数据库存储
const orders: Map<string, Order> = new Map();

// 订单有效期（默认24小时）
const ORDER_EXPIRY_HOURS = 24;

export class OrderService {
  /**
   * 创建买单
   */
  async createBuyOrder(
    userId: string,
    amount: number,
    price: number,
    paymentMethods: PaymentMethod[],
    options?: {
      minTradeAmount?: number;
      maxTradeAmount?: number;
      description?: string;
    }
  ): Promise<Order> {
    return this.createOrder(userId, OrderType.BUY, amount, price, paymentMethods, options);
  }

  /**
   * 创建卖单
   */
  async createSellOrder(
    userId: string,
    amount: number,
    price: number,
    paymentMethods: PaymentMethod[],
    options?: {
      minTradeAmount?: number;
      maxTradeAmount?: number;
      description?: string;
    }
  ): Promise<Order> {
    return this.createOrder(userId, OrderType.SELL, amount, price, paymentMethods, options);
  }

  /**
   * 创建订单（内部方法）
   */
  private async createOrder(
    userId: string,
    type: OrderType,
    amount: number,
    price: number,
    paymentMethods: PaymentMethod[],
    options?: {
      minTradeAmount?: number;
      maxTradeAmount?: number;
      description?: string;
    }
  ): Promise<Order> {
    // 参数验证
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (price <= 0) {
      throw new Error('Price must be positive');
    }
    if (!paymentMethods || paymentMethods.length === 0) {
      throw new Error('At least one payment method is required');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ORDER_EXPIRY_HOURS * 60 * 60 * 1000);

    const order: Order = {
      id: this.generateId(),
      userId,
      type,
      amount,
      price,
      totalPrice: amount * price,
      status: OrderStatus.PENDING,
      minTradeAmount: options?.minTradeAmount || 1,
      maxTradeAmount: options?.maxTradeAmount || amount,
      paymentMethods,
      description: options?.description,
      createdAt: now,
      updatedAt: now,
      expiresAt
    };

    orders.set(order.id, order);
    return order;
  }

  /**
   * 获取订单详情
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const order = orders.get(orderId);
    if (!order) return null;

    // 检查是否过期
    if (order.status === OrderStatus.PENDING && new Date() > order.expiresAt) {
      order.status = OrderStatus.EXPIRED;
      order.updatedAt = new Date();
    }

    return order;
  }

  /**
   * 获取用户的所有订单
   */
  async getUserOrders(userId: string, status?: OrderStatus): Promise<Order[]> {
    const userOrders: Order[] = [];
    
    for (const order of orders.values()) {
      if (order.userId === userId) {
        // 检查过期
        if (order.status === OrderStatus.PENDING && new Date() > order.expiresAt) {
          order.status = OrderStatus.EXPIRED;
          order.updatedAt = new Date();
        }
        
        if (!status || order.status === status) {
          userOrders.push(order);
        }
      }
    }

    // 按创建时间倒序排列
    return userOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 获取市场挂单列表
   */
  async getMarketOrders(
    type?: OrderType,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResponse<Order>> {
    const allOrders = Array.from(orders.values())
      .filter(order => order.status === OrderStatus.PENDING)
      .filter(order => !type || order.type === type)
      .filter(order => new Date() <= order.expiresAt)
      .sort((a, b) => {
        // 买单按价格降序，卖单按价格升序
        if (a.type === OrderType.BUY) {
          return b.price - a.price;
        }
        return a.price - b.price;
      });

    const total = allOrders.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = allOrders.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    const order = orders.get(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.userId !== userId) {
      throw new Error('You can only cancel your own orders');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new Error('Only pending orders can be cancelled');
    }

    order.status = OrderStatus.CANCELLED;
    order.updatedAt = new Date();

    return order;
  }

  /**
   * 更新订单状态
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = orders.get(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    order.status = status;
    order.updatedAt = new Date();

    return order;
  }

  /**
   * 减少订单剩余数量（成交后）
   */
  async reduceOrderAmount(orderId: string, tradedAmount: number): Promise<Order> {
    const order = orders.get(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (tradedAmount <= 0 || tradedAmount > order.amount) {
      throw new Error('Invalid trade amount');
    }

    order.amount -= tradedAmount;
    order.totalPrice = order.amount * order.price;
    order.updatedAt = new Date();

    // 如果订单完全成交
    if (order.amount === 0) {
      order.status = OrderStatus.COMPLETED;
    }

    return order;
  }

  /**
   * 检查订单是否可以交易
   */
  async canTrade(orderId: string, tradeAmount: number): Promise<{ canTrade: boolean; reason?: string }> {
    const order = orders.get(orderId);

    if (!order) {
      return { canTrade: false, reason: 'Order not found' };
    }

    if (order.status !== OrderStatus.PENDING) {
      return { canTrade: false, reason: 'Order is not available for trading' };
    }

    if (new Date() > order.expiresAt) {
      // 更新过期状态
      order.status = OrderStatus.EXPIRED;
      order.updatedAt = new Date();
      return { canTrade: false, reason: 'Order has expired' };
    }

    if (tradeAmount < order.minTradeAmount) {
      return { canTrade: false, reason: `Minimum trade amount is ${order.minTradeAmount}` };
    }

    if (tradeAmount > order.maxTradeAmount) {
      return { canTrade: false, reason: `Maximum trade amount is ${order.maxTradeAmount}` };
    }

    if (tradeAmount > order.amount) {
      return { canTrade: false, reason: 'Insufficient order amount' };
    }

    return { canTrade: true };
  }

  /**
   * 获取订单统计
   */
  async getOrderStats(userId: string): Promise<{
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
  }> {
    const userOrders = await this.getUserOrders(userId);

    return {
      totalOrders: userOrders.length,
      pendingOrders: userOrders.filter(o => o.status === OrderStatus.PENDING).length,
      completedOrders: userOrders.filter(o => o.status === OrderStatus.COMPLETED).length,
      cancelledOrders: userOrders.filter(o => o.status === OrderStatus.CANCELLED).length
    };
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例
export const orderService = new OrderService();