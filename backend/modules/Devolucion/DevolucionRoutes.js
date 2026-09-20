import { Router } from 'express';
import { crearDevolucion, obtenerDevoluciones, eliminarDevolucion } from './DevolucionController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', obtenerDevoluciones);
router.post('/', crearDevolucion);
router.delete('/:id', admin, eliminarDevolucion);

export default router;
