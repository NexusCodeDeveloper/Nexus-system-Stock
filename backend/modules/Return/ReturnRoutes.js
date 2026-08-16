import { Router } from 'express';
import { createReturn, getReturns, deleteReturn } from './ReturnController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', getReturns);
router.post('/', createReturn);
router.delete('/:id', admin, deleteReturn);

export default router;
