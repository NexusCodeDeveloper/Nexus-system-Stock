import { Router } from 'express';
import { reportarError } from './ReporteErrorController.js';

const router = Router();

router.post('/', reportarError);

export default router;
