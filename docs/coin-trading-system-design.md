# 金币交易系统设计文档

## 一、系统概述

一个去中心化的金币（代币）交易系统，支持：

- **金币空投**：定期向用户发放金币
- **任务系统**：用户可接任务赚取金币，或创建任务消耗金币
- **P2P 交易**：用户之间可自由交易，平台作为担保方
- **冻结机制**：交易过程中金币被冻结，保障双方权益
- **争议处理**：出现争议时平台介入仲裁

---

## 二、核心概念

### 2.1 金币（Coin）

```
金币 = 平台代币
- 不会直接发放
- 定期空投
- 可通过任务获得
- 可用于交易
```

### 2.2 交易流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        交易流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  买家                      平台                      卖家        │
│   │                        │                         │          │
│   │  1. 创建订单           │                         │          │
│   │ ─────────────────────>│                         │          │
│   │                        │                         │          │
│   │  2. 冻结金币           │                         │          │
│   │ ─────────────────────>│  金币锁定到平台          │          │
│   │                        │ ─────────────────────>  │          │
│   │                        │                         │          │
│   │  3. 支付（线下）       │                         │          │
│   │ ──────────────────────────────────────────────> │          │
│   │                        │                         │          │
│   │  4. 确认支付           │                         │          │
│   │ ─────────────────────>│                         │          │
│   │                        │                         │          │
│   │                        │  5. 确认交易            │          │
│   │                        │ <─────────────────────  │          │
│   │                        │                         │          │
│   │                        │  6. 释放金币            │          │
│   │                        │ ─────────────────────>  │          │
│   │                        │                         │          │
│   │  7. 交易完成           │                         │          │
│   │ <─────────────────────│─────────────────────────│          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 冻结阶段

```
┌─────────────────────────────────────────────────────────────────┐
│                        冻结阶段                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  阶段 1：待支付                                                  │
│  ├─ 冻结时间：5 分钟                                             │
│  ├─ 状态：等待买家支付                                           │
│  └─ 超时：自动解冻，订单取消                                      │
│                                                                 │
│  阶段 2：待确认                                                  │
│  ├─ 冻结时间：30 分钟                                            │
│  ├─ 状态：买家已支付，等待卖家确认                                │
│  ├─ 争议：买家可点击"未收到货"                                    │
│  └─ 超时：自动确认或进入争议                                      │
│                                                                 │
│  阶段 3：争议中                                                  │
│  ├─ 冻结时间：24 小时                                            │
│  ├─ 状态：客服介入                                               │
│  ├─ 要求：双方提供证据                                           │
│  └─ 结果：客服裁决或自动处理                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、数据模型

### 3.1 用户表（User）

```typescript
interface User {
  id: string;                  // 用户 ID
  name: string;                // 用户名
  email: string;               // 邮箱
  balance: number;             // 可用余额
  frozenBalance: number;       // 冻结余额
  createdAt: Date;             // 创建时间
  reputation: number;          // 信誉分（0-100）
  isBanned: boolean;           // 是否被封禁
}
```

### 3.2 金币记录表（CoinRecord）

```typescript
interface CoinRecord {
  id: string;                  // 记录 ID
  userId: string;              // 用户 ID
  type: 'airdrop' | 'task' | 'trade' | 'freeze' | 'release';
  amount: number;              // 数量（正为收入，负为支出）
  balance: number;             // 变更后余额
  relatedId?: string;          // 关联 ID（订单 ID、任务 ID 等）
  description: string;         // 描述
  createdAt: Date;             // 创建时间
}
```

### 3.3 订单表（Order）

```typescript
interface Order {
  id: string;                  // 订单 ID
  buyerId: string;             // 买家 ID
  sellerId: string;            // 卖家 ID
  amount: number;              // 交易金额
  fee: number;                 // 平台手续费（2%，最少 1 金币）
  
  status: OrderStatus;         // 订单状态
  freezeUntil: Date;           // 冻结截止时间
  
  buyerConfirmed: boolean;     // 买家是否确认支付
  sellerConfirmed: boolean;    // 卖家是否确认交易
  
  evidence?: Evidence[];       // 证据列表
  disputeReason?: string;      // 争议原因
  
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 更新时间
}

enum OrderStatus {
  PENDING = 'pending',           // 待支付（冻结 5 分钟）
  PAID = 'paid',                 // 已支付，待确认（冻结 30 分钟）
  DISPUTED = 'disputed',         // 争议中（冻结 24 小时）
  COMPLETED = 'completed',       // 已完成
  CANCELLED = 'cancelled',       // 已取消
  REFUNDED = 'refunded',         // 已退款
}
```

### 3.4 证据表（Evidence）

```typescript
interface Evidence {
  id: string;                  // 证据 ID
  orderId: string;             // 订单 ID
  userId: string;              // 提供者 ID
  type: 'image' | 'text' | 'link';
  content: string;             // 证据内容
  createdAt: Date;             // 创建时间
}
```

### 3.5 任务表（Task）

```typescript
interface Task {
  id: string;                  // 任务 ID
  creatorId: string;           // 创建者 ID
  title: string;               // 任务标题
  description: string;         // 任务描述
  reward: number;              // 奖励金币
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  assigneeId?: string;         // 接受者 ID
  proofUrl?: string;           // 完成证明
  createdAt: Date;
  completedAt?: Date;
}
```

---

## 四、API 设计

### 4.1 金币相关

```typescript
// 获取余额
GET /api/coins/balance
Response: { balance: number, frozenBalance: number }

// 获取金币记录
GET /api/coins/records?page=1&limit=20
Response: { records: CoinRecord[], total: number }

// 空投（管理员）
POST /api/coins/airdrop
Body: { userIds: string[], amount: number }
```

### 4.2 交易相关

```typescript
// 创建订单
POST /api/orders
Body: {
  sellerId: string;        // 卖家 ID
  amount: number;          // 交易金额
  description?: string;    // 订单描述
}
Response: {
  orderId: string;
  freezeUntil: Date;       // 冻结截止时间
  status: 'pending';
}

// 确认支付（买家）
POST /api/orders/:orderId/confirm-payment
Body: {
  paymentProof?: string;   // 支付证明
}
Response: {
  status: 'paid';
  freezeUntil: Date;       // 新的冻结截止时间
}

// 确认交易（卖家）
POST /api/orders/:orderId/confirm-trade
Response: {
  status: 'completed';
  message: '交易完成';
}

// 取消订单
POST /api/orders/:orderId/cancel
Response: {
  status: 'cancelled';
  message: '订单已取消，金币已解冻';
}

// 提起争议
POST /api/orders/:orderId/dispute
Body: {
  reason: string;          // 争议原因
  evidence?: string;       // 证据
}
Response: {
  status: 'disputed';
  freezeUntil: Date;
  message: '争议已提交，客服将介入处理';
}

// 提交证据
POST /api/orders/:orderId/evidence
Body: {
  type: 'image' | 'text' | 'link';
  content: string;
}
```

### 4.3 任务相关

```typescript
// 创建任务
POST /api/tasks
Body: {
  title: string;
  description: string;
  reward: number;          // 奖励金币
}

// 接受任务
POST /api/tasks/:taskId/accept

// 完成任务
POST /api/tasks/:taskId/complete
Body: {
  proofUrl: string;        // 完成证明
}

// 获取任务列表
GET /api/tasks?status=open&page=1&limit=20
```

### 4.4 商家接入

```typescript
// 商家注册
POST /api/merchants/register
Body: {
  name: string;
  callbackUrl: string;     // 回调地址
  publicKey: string;       // 公钥（用于验证签名）
}
Response: {
  merchantId: string;
  apiKey: string;          // API 密钥
  secretKey: string;       // 密钥
}

// 商家创建订单
POST /api/merchants/orders
Headers: { Authorization: Bearer <apiKey> }
Body: {
  buyerName: string;       // 买家标识
  amount: number;
  description?: string;
}
Response: {
  orderId: string;
  paymentUrl: string;      // 支付页面 URL
}

// 商家查询订单
GET /api/merchants/orders/:orderId

// 回调通知（平台 -> 商家）
POST <callbackUrl>
Body: {
  orderId: string;
  status: string;
  amount: number;
  timestamp: number;
  sign: string;            // 签名
}
```

---

## 五、核心逻辑

### 5.1 冻结机制

```typescript
// 冻结金币
async function freezeCoins(userId: string, amount: number, orderId: string) {
  const user = await getUser(userId);
  
  // 检查余额
  if (user.balance < amount) {
    throw new Error('余额不足');
  }
  
  // 冻结
  user.balance -= amount;
  user.frozenBalance += amount;
  
  // 记录
  await createCoinRecord({
    userId,
    type: 'freeze',
    amount: -amount,
    relatedId: orderId,
    description: `订单 ${orderId} 冻结`,
  });
  
  await saveUser(user);
}

// 解冻金币
async function releaseCoins(userId: string, amount: number, orderId: string) {
  const user = await getUser(userId);
  
  user.frozenBalance -= amount;
  user.balance += amount;
  
  await createCoinRecord({
    userId,
    type: 'release',
    amount: amount,
    relatedId: orderId,
    description: `订单 ${orderId} 解冻`,
  });
  
  await saveUser(user);
}

// 转移金币（冻结 -> 冻结）
async function transferFrozenCoins(
  fromUserId: string, 
  toUserId: string, 
  amount: number,
  orderId: string
) {
  const fromUser = await getUser(fromUserId);
  const toUser = await getUser(toUserId);
  
  // 从冻结余额扣除
  fromUser.frozenBalance -= amount;
  
  // 扣除手续费
  const fee = Math.max(Math.ceil(amount * 0.02), 1);
  const actualAmount = amount - fee;
  
  // 转入对方可用余额
  toUser.balance += actualAmount;
  
  // 记录
  await createCoinRecord({
    userId: fromUserId,
    type: 'trade',
    amount: -amount,
    relatedId: orderId,
    description: `订单 ${orderId} 交易支出`,
  });
  
  await createCoinRecord({
    userId: toUserId,
    type: 'trade',
    amount: actualAmount,
    relatedId: orderId,
    description: `订单 ${orderId} 交易收入`,
  });
  
  await saveUser(fromUser);
  await saveUser(toUser);
}
```

### 5.2 订单状态机

```typescript
// 订单状态流转
const ORDER_TRANSITIONS = {
  pending: ['paid', 'cancelled'],      // 待支付 -> 已支付 / 已取消
  paid: ['completed', 'disputed', 'cancelled'],  // 已支付 -> 已完成 / 争议 / 已取消
  disputed: ['completed', 'refunded'], // 争议中 -> 已完成 / 已退款
  completed: [],                       // 已完成 -> 终态
  cancelled: [],                       // 已取消 -> 终态
  refunded: [],                        // 已退款 -> 终态
};

// 自动处理超时订单
async function processExpiredOrders() {
  const expiredOrders = await getExpiredOrders();
  
  for (const order of expiredOrders) {
    if (order.status === 'pending') {
      // 待支付超时：自动取消
      await cancelOrder(order.id);
    } else if (order.status === 'paid') {
      // 已支付超时：自动确认
      await completeOrder(order.id);
    } else if (order.status === 'disputed') {
      // 争议超时：根据证据裁决
      await resolveDispute(order.id);
    }
  }
}
```

### 5.3 防恶意机制

```typescript
// 检查用户是否有恶意行为
async function checkMaliciousUser(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  
  // 信誉分过低
  if (user.reputation < 30) {
    return true;
  }
  
  // 最近有争议订单
  const recentDisputes = await getRecentDisputes(userId, 7); // 最近 7 天
  if (recentDisputes.length > 3) {
    return true;
  }
  
  // 频繁取消订单
  const recentCancellations = await getRecentCancellations(userId, 1); // 最近 1 天
  if (recentCancellations.length > 5) {
    return true;
  }
  
  return false;
}

// 限制创建订单频率
async function checkOrderRateLimit(userId: string): Promise<boolean> {
  const recentOrders = await getRecentOrders(userId, 1); // 最近 1 小时
  return recentOrders.length < 10; // 每小时最多 10 个订单
}

// 争议处理
async function resolveDispute(orderId: string) {
  const order = await getOrder(orderId);
  const buyerEvidence = order.evidence.filter(e => e.userId === order.buyerId);
  const sellerEvidence = order.evidence.filter(e => e.userId === order.sellerId);
  
  // 如果只有一方提供证据
  if (buyerEvidence.length > 0 && sellerEvidence.length === 0) {
    // 买家胜诉，退款
    await refundOrder(orderId);
    await updateUserReputation(order.sellerId, -10);
  } else if (sellerEvidence.length > 0 && buyerEvidence.length === 0) {
    // 卖家胜诉，交易完成
    await completeOrder(orderId);
    await updateUserReputation(order.buyerId, -10);
  } else {
    // 双方都提供证据，需要人工审核
    await escalateToSupport(orderId);
  }
}
```

---

## 六、技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端                                      │
│                    (React + TypeScript)                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│                      (Nginx / Kong)                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        后端服务                                  │
│                    (Node.js + Express)                          │
│                                                                 │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│   │ 用户服务       │  │ 订单服务       │  │ 任务服务       │      │
│   └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│   │ 金币服务       │  │ 争议服务       │  │ 商家服务       │      │
│   └───────────────┘  └───────────────┘  └───────────────┘      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                    │
│                                                                 │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│   │ PostgreSQL    │  │ Redis         │  │ Elasticsearch │      │
│   │ (主数据库)    │  │ (缓存/队列)   │  │ (搜索)        │      │
│   └───────────────┘  └───────────────┘  └───────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 七、执行计划

### 阶段 1：基础架构（1-2 周）

- [ ] 项目初始化
- [ ] 数据库设计
- [ ] 用户系统
- [ ] 金币系统

### 阶段 2：核心功能（2-3 周）

- [ ] 订单系统
- [ ] 冻结机制
- [ ] 交易流程
- [ ] 任务系统

### 阶段 3：安全与争议（1-2 周）

- [ ] 防恶意机制
- [ ] 争议处理
- [ ] 信誉系统

### 阶段 4：商家接入（1-2 周）

- [ ] 商家 API
- [ ] 回调机制
- [ ] 文档编写

---

## 八、下一步

你想让我：

1. **生成代码框架** - 创建项目结构和基础代码
2. **详细设计某个模块** - 比如订单系统、冻结机制
3. **创建数据库迁移** - PostgreSQL 表结构
4. **使用 Agent 团队开发** - 让 Team Lead 分配任务给团队成员