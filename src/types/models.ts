/**
 * 金币交易系统 - 数据库模型定义
 * 基于 better-sqlite3
 */

export interface User {
  id: string;
  username: string;
  email: string;
  balance: number;           // 可用金币
  frozen_balance: number;     // 冻结金币
  reputation: number;        // 信誉分 (0-100)
  is_blacklisted: boolean;    // 是否在黑名单
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  seller_id: string;         // 卖家ID
  buyer_id: string | null;   // 买家ID（创建时可选）
  amount: number;            // 交易数量
  fee: number;               // 手续费
  status: OrderStatus;       // 订单状态
  payment_method: string;    // 支付方式
  payment_proof?: string;    // 支付凭证
  current_stage: number;     // 当前冻结阶段 (1-3)
  freeze_until: string;      // 当前阶段截止时间
  evidence?: string;         // 争议证据 (JSON)
  dispute_reason?: string;   // 争议原因
  completed_at?: string;     // 完成时间
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 
  | 'pending'     // 等待支付
  | 'paid'        // 已支付待确认
  | 'disputed'    // 争议处理中
  | 'completed'   // 已完成
  | 'cancelled';  // 已取消

export interface Task {
  id: string;
  creator_id: string;        // 创建者
  acceptor_id?: string;      // 接受者
  title: string;
  description: string;
  reward: number;            // 悬赏金币
  status: TaskStatus;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 
  | 'open'         // 开放接受
  | 'in_progress'  // 进行中
  | 'completed'    // 已完成
  | 'cancelled';   // 已取消

export interface Transaction {
  id: string;
  from_user_id: string | null;  // null 表示系统发放
  to_user_id: string;
  amount: number;
  type: TransactionType;
  reference_id?: string;     // 关联订单/任务ID
  description: string;
  created_at: string;
}

export type TransactionType = 
  | 'airdrop'      // 空投
  | 'task_reward'  // 任务奖励
  | 'task_create'  // 创建任务扣费
  | 'order_create' // 创建订单冻结
  | 'order_cancel' // 订单取消退款
  | 'order_fee'    // 订单手续费
  | 'order_income' // 订单收入
  | 'dispute_refund'; // 争议退款

export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;           // 1-5 星
  comment?: string;
  created_at: string;
}

export interface FreezeStage {
  id: string;
  order_id: string;
  stage: number;            // 阶段 1-3
  status: string;
  started_at: string;
  expires_at: string;
  action_taken?: string;
}