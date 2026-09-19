import { Router } from 'express';
import { obtenerMovimientosStock } from './MovimientoStockController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', admin, obtenerMovimientosStock);

export default router;
