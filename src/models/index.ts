/**
 * 数据模型定义
 * 金币交易系统核心类型
 */

// ==================== 用户模型 ====================

export interface User {
  id: string;
  username: string;
  email: string;
  balance: number;          // 可用金币
  frozenBalance: number;     // 冻结金币
  reputation: number;        // 信誉分 (0-100)
  isBlacklisted: boolean;    // 是否在黑名单
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  username: string;
  email: string;
}

// ==================== 订单模型 ====================

export type OrderStatus = 
  | 'pending'      // 等待支付（阶段1）
  | 'paid'         // 已支付待确认（阶段2）
  | 'disputed'     // 争议处理中（阶段3）
  | 'completed'    // 已完成
  | 'cancelled';   // 已取消

export type FreezePhase = 1 | 2 | 3;

export interface Order {
  id: string;
  sellerId: string;          // 卖家ID
  buyerId?: string;           // 买家ID（可选）
  amount: number;            // 交易数量
  fee: number;               // 手续费
  status: OrderStatus;
  freezePhase: FreezePhase;
  freezeUntil: Date;         // 当前阶段截止时间
  evidence?: string[];        // 争议证据
  sellerRating?: number;      // 卖家评分 (1-5)
  buyerRating?: number;       // 买家评分 (1-5)
  description?: string;       // 订单描述
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderDTO {
  sellerId: string;
  amount: number;
  description?: string;
}

export interface ConfirmOrderDTO {
  buyerId: string;
  evidence?: string;
}

export interface DisputeOrderDTO {
  reason: string;
  evidence: string;
}

// ==================== 任务模型 ====================

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  creatorId: string;         // 创建者
  acceptorId?: string;        // 接受者
  reward: number;            // 悬赏金币
  status: TaskStatus;
  title: string;
  description: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskDTO {
  creatorId: string;
  reward: number;
  title: string;
  description: string;
}

// ==================== 空投模型 ====================

export interface Airdrop {
  id: string;
  amount: number;            // 单个用户获得的金币数
  totalRecipients: number;   // 总接收人数
  createdAt: Date;
}

export interface AirdropRecipient {
  id: string;
  airdropId: string;
  userId: string;
  amount: number;
  receivedAt: Date;
}

// ==================== 配置常量 ====================

export const TRADING_CONFIG = {
  // 冻结时间配置（毫秒）
  FREEZE_PHASES: {
    1: 5 * 60 * 1000,      // 阶段1：等待支付，5分钟
    2: 30 * 60 * 1000,     // 阶段2：已支付待确认，30分钟
    3: 24 * 60 * 60 * 1000 // 阶段3：争议处理，24小时
  },
  
  // 交易限制
  MIN_TRADE_AMOUNT: 100,     // 最低交易金额
  FEE_PERCENTAGE: 0.02,       // 手续费比例 2%
  MIN_FEE: 1,                 // 最低手续费
  
  // 证据提交时间限制
  EVIDENCE_TIMEOUT: 10 * 60 * 1000, // 10分钟
  
  // 初始值
  INITIAL_REPUTATION: 50,
  INITIAL_BALANCE: 0
};

// ==================== API 响应类型 ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}