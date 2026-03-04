/**
 * 金币交易系统 - 数据模型定义
 * Issue #3: P2P交易 + 任务系统 + 冻结机制
 */

// ==================== 用户相关类型 ====================

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  coins: number;              // 可用金币
  frozenCoins: number;        // 冻结金币
  reputation: number;         // 信用评分
  createdAt: Date;
  updatedAt: Date;
}

export interface UserBalance {
  userId: string;
  availableCoins: number;     // 可用余额
  frozenCoins: number;         // 冻结余额
  totalCoins: number;         // 总余额
}

// ==================== 订单相关类型 ====================

export enum OrderType {
  BUY = 'BUY',    // 买单 - 想要购买金币
  SELL = 'SELL'   // 卖单 - 想要出售金币
}

export enum OrderStatus {
  PENDING = 'PENDING',           // 待交易
  PROCESSING = 'PROCESSING',     // 处理中
  COMPLETED = 'COMPLETED',       // 已完成
  CANCELLED = 'CANCELLED',       // 已取消
  EXPIRED = 'EXPIRED'           // 已过期
}

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  amount: number;             // 金币数量
  price: number;              // 单价（人民币）
  totalPrice: number;          // 总价
  status: OrderStatus;
  minTradeAmount: number;      // 最小交易数量
  maxTradeAmount: number;      // 最大交易数量
  paymentMethods: PaymentMethod[];  // 支付方式
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface PaymentMethod {
  type: 'ALIPAY' | 'WECHAT' | 'BANK_TRANSFER';
  account: string;
  name: string;
}

// ==================== 交易相关类型 ====================

export enum TradeStatus {
  PENDING = 'PENDING',           // 待付款
  PAID = 'PAID',               // 已付款，待确认
  CONFIRMED = 'CONFIRMED',      // 已确认，待释放
  COMPLETED = 'COMPLETED',      // 交易完成
  CANCELLED = 'CANCELLED',      // 已取消
  DISPUTED = 'DISPUTED'        // 争议中
}

export interface Trade {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  amount: number;              // 金币数量
  price: number;               // 单价
  totalPrice: number;           // 总价
  status: TradeStatus;
  paymentMethod: PaymentMethod;
  frozenAmount: number;         // 冻结金额（卖方）
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  completedAt?: Date;
}

export interface TradeDispute {
  id: string;
  tradeId: string;
  reporterId: string;
  reason: string;
  description: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  resolution?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

// ==================== 任务系统相关类型 ====================

export enum TaskType {
  DAILY_SIGN = 'DAILY_SIGN',         // 每日签到
  FIRST_TRADE = 'FIRST_TRADE',        // 首次交易
  TRADE_VOLUME = 'TRADE_VOLUME',      // 交易量任务
  INVITE_FRIEND = 'INVITE_FRIEND',    // 邀请好友
  COMPLETE_PROFILE = 'COMPLETE_PROFILE'  // 完善资料
}

export enum TaskStatus {
  AVAILABLE = 'AVAILABLE',     // 可领取
  IN_PROGRESS = 'IN_PROGRESS', // 进行中
  COMPLETED = 'COMPLETED',     // 已完成
  CLAIMED = 'CLAIMED'         // 已领取奖励
}

export interface Task {
  id: string;
  type: TaskType;
  name: string;
  description: string;
  reward: number;             // 奖励金币
  requirements: TaskRequirement[];
  status: TaskStatus;
  progress: number;           // 当前进度
  targetProgress: number;     // 目标进度
  expiresAt?: Date;
}

export interface TaskRequirement {
  type: string;
  value: number;
}

export interface UserTask {
  id: string;
  userId: string;
  taskId: string;
  status: TaskStatus;
  progress: number;
  completedAt?: Date;
  claimedAt?: Date;
}

// ==================== 冻结机制相关类型 ====================

export enum FreezeReason {
  TRADE_ESCROW = 'TRADE_ESCROW',      // 交易托管
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS',  // 可疑活动
  DISPUTE = 'DISPUTE',                // 争议冻结
  ADMIN_HOLD = 'ADMIN_HOLD'          // 管理员冻结
}

export interface FrozenRecord {
  id: string;
  userId: string;
  amount: number;
  reason: FreezeReason;
  relatedTradeId?: string;
  relatedOrderId?: string;
  frozenAt: Date;
  unfrozenAt?: Date;
  status: 'FROZEN' | 'UNFROZEN';
  notes?: string;
}

// ==================== 交易记录类型 ====================

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',           // 充值
  WITHDRAW = 'WITHDRAW',         // 提现
  BUY = 'BUY',                   // 购买
  SELL = 'SELL',                 // 出售
  REWARD = 'REWARD',            // 奖励
  FREEZE = 'FREEZE',            // 冻结
  UNFREEZE = 'UNFREEZE',         // 解冻
  REFUND = 'REFUND'             // 退款
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  relatedTradeId?: string;
  relatedTaskId?: string;
  description: string;
  createdAt: Date;
}

// ==================== API 响应类型 ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}