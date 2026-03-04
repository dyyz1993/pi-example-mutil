/**
 * API 请求/响应类型定义
 */

import type { OrderStatus, TaskStatus } from './models.js';

// ===== 用户相关 =====
export interface CreateUserRequest {
  username: string;
  email: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  balance: number;
  frozen_balance: number;
  reputation: number;
  is_blacklisted: boolean;
  created_at: string;
}

export interface BalanceResponse {
  balance: number;
  frozen_balance: number;
  total: number;
}

// ===== 订单相关 =====
export interface CreateOrderRequest {
  seller_id: string;
  amount: number;
  payment_method: string;
}

export interface AcceptOrderRequest {
  buyer_id: string;
}

export interface PayOrderRequest {
  payment_proof: string;
}

export interface ConfirmOrderRequest {
  seller_id: string;
}

export interface DisputeOrderRequest {
  reason: string;
  evidence: string[];
}

export interface SubmitEvidenceRequest {
  evidence: string[];
}

export interface OrderResponse {
  id: string;
  seller_id: string;
  buyer_id: string | null;
  amount: number;
  fee: number;
  status: OrderStatus;
  payment_method: string;
  payment_proof: string | null;
  current_stage: number;
  freeze_until: string;
  evidence: string[] | null;
  dispute_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OrderListResponse {
  orders: OrderResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ===== 任务相关 =====
export interface CreateTaskRequest {
  creator_id: string;
  title: string;
  description: string;
  reward: number;
}

export interface AcceptTaskRequest {
  acceptor_id: string;
}

export interface TaskResponse {
  id: string;
  creator_id: string;
  acceptor_id: string | null;
  title: string;
  description: string;
  reward: number;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ===== 交易相关 =====
export interface TransactionResponse {
  id: string;
  from_user_id: string | null;
  to_user_id: string;
  amount: number;
  type: string;
  reference_id: string | null;
  description: string;
  created_at: string;
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  total: number;
  page: number;
  page_size: number;
}

// ===== 评价相关 =====
export interface CreateReviewRequest {
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
}

export interface ReviewResponse {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ===== 通用响应 =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}