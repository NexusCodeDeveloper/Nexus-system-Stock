import { Router } from 'express';
import {
  obtenerProductos,
  obtenerProducto,
  obtenerProductoPorCodigo,
  siguienteCodigo,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  obtenerEstadisticasTablero,
  intercambiarProducto,
  agregarStock,
  agregarDeposito,
  reponerStock,
  pasarAlSalon,
  retirarStock,
  obtenerStockBajo,
} from './ProductoController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/stats', obtenerEstadisticasTablero);
router.get('/stock-bajo', obtenerStockBajo);
router.get('/codigo/:codigo', obtenerProductoPorCodigo);
router.get('/siguiente-codigo', admin, siguienteCodigo);
router.get('/', obtenerProductos);
router.get('/:id', obtenerProducto);
router.post('/', admin, crearProducto);
router.put('/:id', admin, actualizarProducto);
router.put('/:id/agregar-stock', admin, agregarStock);
router.put('/:id/deposito', admin, agregarDeposito);
router.post('/pasar-salon', pasarAlSalon);
router.post('/:id/reponer', reponerStock);
router.post('/:id/retirar', admin, retirarStock);
router.post('/intercambio', intercambiarProducto);
router.delete('/:id', admin, eliminarProducto);

export default router;
