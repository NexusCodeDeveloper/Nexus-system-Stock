import { Router } from 'express';
import {
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  completeNotification,
  reopenNotification,
  markVistasAdmin,
} from './NotificationController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', getNotifications);
router.post('/', admin, createNotification);
router.patch('/marcar-vistas-admin', admin, markVistasAdmin);
router.put('/:id', admin, updateNotification);
router.delete('/:id', admin, deleteNotification);
router.patch('/:id/completar', completeNotification);
router.patch('/:id/reabrir', admin, reopenNotification);

export default router;