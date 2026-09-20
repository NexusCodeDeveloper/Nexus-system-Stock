import { Router } from 'express';
import { crearVenta, eliminarVenta, obtenerVentas, obtenerEstadisticasVentas, obtenerMasVendidos, abrirCaja, obtenerCajaAbierta, cerrarCaja, reabrirCaja, obtenerCierresCaja, eliminarCierreCaja, reenviarMailCierre, probarCorreo, estadoCorreo, ejecutarMigracion, migrarTickets } from './VentaController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.post('/caja/abrir', abrirCaja);
router.get('/caja/abierta', obtenerCajaAbierta);
router.post('/caja/cerrar', cerrarCaja);
router.post('/caja/reabrir', admin, reabrirCaja);
router.get('/cierres-caja', obtenerCierresCaja);
router.delete('/cierres-caja/:id', admin, eliminarCierreCaja);
router.post('/cierres-caja/:id/reenviar-mail', admin, reenviarMailCierre);
router.get('/stats', obtenerEstadisticasVentas);
router.get('/mas-vendidos', obtenerMasVendidos);
router.get('/', obtenerVentas);
if (process.env.NODE_ENV !== 'production') {
  router.post('/probar-correo', admin, probarCorreo);
  router.get('/estado-correo', admin, estadoCorreo);
  router.post('/migrar', admin, ejecutarMigracion);
  router.post('/migrar-tickets', admin, migrarTickets);
}
router.post('/', crearVenta);
router.delete('/:id', admin, eliminarVenta);

export default router;
