import { Router } from 'express';
import { createSale, deleteSale, getSales, getSalesStats, getMostSold, abrirCaja, getCajaAbierta, cerrarCaja, reabrirCaja, getDailyCloses, deleteDailyClose, resendCloseMail, mailTest, mailStatus, runMigration, migrateTickets } from './SaleController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.post('/caja/abrir', abrirCaja);
router.get('/caja/abierta', getCajaAbierta);
router.post('/caja/cerrar', cerrarCaja);
router.post('/caja/reabrir', admin, reabrirCaja);
router.get('/daily-closes', getDailyCloses);
router.delete('/daily-closes/:id', admin, deleteDailyClose);
router.post('/daily-closes/:id/resend-mail', admin, resendCloseMail);
router.get('/stats', getSalesStats);
router.get('/most-sold', getMostSold);
router.get('/', getSales);
if (process.env.NODE_ENV !== 'production') {
  router.post('/mail-test', admin, mailTest);
  router.get('/mail-status', admin, mailStatus);
  router.post('/migrate', admin, runMigration);
  router.post('/migrate-tickets', admin, migrateTickets);
}
router.post('/', createSale);
router.delete('/:id', admin, deleteSale);

export default router;
