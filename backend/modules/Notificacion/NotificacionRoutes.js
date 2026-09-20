import { Router } from 'express';
import {
  obtenerNotificaciones,
  crearNotificacion,
  actualizarNotificacion,
  eliminarNotificacion,
  completarNotificacion,
  reabrirNotificacion,
  marcarVistasAdmin,
} from './NotificacionController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', obtenerNotificaciones);
router.post('/', admin, crearNotificacion);
router.patch('/marcar-vistas-admin', admin, marcarVistasAdmin);
router.put('/:id', admin, actualizarNotificacion);
router.delete('/:id', admin, eliminarNotificacion);
router.patch('/:id/completar', completarNotificacion);
router.patch('/:id/reabrir', admin, reabrirNotificacion);

export default router;