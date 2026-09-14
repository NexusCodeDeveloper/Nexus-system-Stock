import { Router } from 'express';
import { login, getMe } from './AuthController.js';
import { protect } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', protect, getMe);

export default router;
