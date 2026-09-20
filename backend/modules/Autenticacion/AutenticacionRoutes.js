import { Router } from 'express';
import { iniciarSesion, obtenerPerfil } from './AutenticacionController.js';
import { proteger } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.post('/login', iniciarSesion);
router.get('/me', proteger, obtenerPerfil);

export default router;