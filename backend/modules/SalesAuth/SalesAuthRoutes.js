import { Router } from 'express';
import { salesLogin } from './SalesAuthController.js';
import { protect } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.post('/login', protect, salesLogin);

export default router;
