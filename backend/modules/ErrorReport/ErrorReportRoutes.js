import { Router } from 'express';
import { reportError } from './ErrorReportController.js';

const router = Router();

router.post('/', reportError);

export default router;
