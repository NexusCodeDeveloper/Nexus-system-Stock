import { Router } from 'express';
import { login, getMe, seed } from './AuthController.js';
import { protect } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/seed', protect, seed);

export default router;
