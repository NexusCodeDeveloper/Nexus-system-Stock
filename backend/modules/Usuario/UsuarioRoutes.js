import { Router } from 'express';
import {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  reiniciarClave,
  cambiarActivo,
  eliminarUsuario,
} from './UsuarioController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger, admin);

router.get('/', obtenerUsuarios);
router.post('/', crearUsuario);
router.put('/:id', actualizarUsuario);
router.patch('/:id/clave', reiniciarClave);
router.patch('/:id/activo', cambiarActivo);
router.delete('/:id', eliminarUsuario);

export default router;