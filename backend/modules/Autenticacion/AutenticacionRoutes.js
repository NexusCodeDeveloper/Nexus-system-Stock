import { Router } from 'express';
import { iniciarSesion, cerrarSesion, obtenerPerfil } from './AutenticacionController.js';
import { proteger } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.post('/login', iniciarSesion);
router.post('/logout', proteger, cerrarSesion);
router.get('/me', proteger, obtenerPerfil);

export default router;