import { Router } from 'express';
import {
  obtenerProveedores,
  obtenerProveedor,
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
} from './ProveedorController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', admin, obtenerProveedores);
router.get('/:id', admin, obtenerProveedor);
router.post('/', admin, crearProveedor);
router.put('/:id', admin, actualizarProveedor);
router.delete('/:id', admin, eliminarProveedor);

export default router;
