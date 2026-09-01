import { Router } from 'express';
import { createCashWithdrawal, getCashWithdrawals, deleteCashWithdrawal, getAvailableCash } from './CashWithdrawalController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.post('/', createCashWithdrawal);
router.get('/available', getAvailableCash);
router.get('/', getCashWithdrawals);
router.delete('/:id', admin, deleteCashWithdrawal);

export default router;