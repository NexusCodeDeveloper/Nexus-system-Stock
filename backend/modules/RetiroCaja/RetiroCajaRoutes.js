import { Router } from 'express';
import { crearRetiroCaja, obtenerRetirosCaja, eliminarRetiroCaja, obtenerDisponibleCaja } from './RetiroCajaController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.post('/', crearRetiroCaja);
router.get('/disponible', obtenerDisponibleCaja);
router.get('/', obtenerRetirosCaja);
router.delete('/:id', admin, eliminarRetiroCaja);

export default router;