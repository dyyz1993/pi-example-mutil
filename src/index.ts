/**
 * 金币交易系统 - 主入口
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase, closeDatabase } from './database/index.js';
import routes from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API 路由
app.use('/api', routes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: '金币交易系统 API',
    version: '1.0.0',
    description: 'P2P金币交易 + 任务系统 + 冻结机制',
    endpoints: {
      users: '/api/users',
      orders: '/api/orders',
      tasks: '/api/tasks',
      airdrops: '/api/airdrops',
      health: '/health'
    }
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found'
  });
});

// 错误处理
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 初始化数据库并启动服务器
initDatabase();

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    closeDatabase();
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    closeDatabase();
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export default app;