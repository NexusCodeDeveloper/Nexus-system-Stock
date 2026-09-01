import { Router } from 'express';
import { subscribe, unsubscribe } from './PushController.js';
import { protect } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.post('/subscribe', subscribe);
router.delete('/subscribe', unsubscribe);

export default router;