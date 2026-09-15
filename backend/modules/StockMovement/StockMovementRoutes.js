import { Router } from 'express';
import { getStockMovements } from './StockMovementController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', admin, getStockMovements);

export default router;
