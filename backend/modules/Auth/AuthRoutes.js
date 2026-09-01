import { Router } from 'express';
import { login, getMe, seed } from './AuthController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', protect, getMe);
if (process.env.NODE_ENV !== 'production') {
  router.post('/seed', protect, admin, seed);
}

export default router;
