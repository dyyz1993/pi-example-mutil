/**
 * API 路由汇总
 */

import { Router } from 'express';
import usersRouter from './users.js';
import ordersRouter from './orders.js';
import tasksRouter from './tasks.js';
import airdropsRouter from './airdrops.js';

const router = Router();

// 挂载各模块路由
router.use('/users', usersRouter);
router.use('/orders', ordersRouter);
router.use('/tasks', tasksRouter);
router.use('/airdrops', airdropsRouter);

export default router;