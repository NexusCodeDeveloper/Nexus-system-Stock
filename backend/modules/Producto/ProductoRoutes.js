import { Router } from 'express';
import {
  obtenerProductos,
  obtenerCategorias,
  obtenerProducto,
  obtenerProductoPorCodigo,
  siguienteCodigo,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  restaurarProducto,
  eliminarDefinitivo,
  obtenerEstadisticasTablero,
  intercambiarProducto,
  agregarStock,
  agregarDeposito,
  reponerStock,
  pasarAlSalon,
  retirarStock,
  obtenerStockBajo,
  aplicarAumentoMasivo,
  obtenerAumentos,
  deshacerAumento,
} from './ProductoController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/stats', obtenerEstadisticasTablero);
router.get('/stock-bajo', obtenerStockBajo);
router.get('/categorias', obtenerCategorias);
router.get('/codigo/:codigo', obtenerProductoPorCodigo);
router.get('/siguiente-codigo', admin, siguienteCodigo);
router.get('/aumentos', admin, obtenerAumentos);
router.get('/', obtenerProductos);
router.get('/:id', obtenerProducto);
router.post('/', admin, crearProducto);
router.post('/aumento-masivo', admin, aplicarAumentoMasivo);
router.post('/aumentos/:id/deshacer', admin, deshacerAumento);
router.put('/:id', admin, actualizarProducto);
router.put('/:id/agregar-stock', admin, agregarStock);
router.put('/:id/deposito', admin, agregarDeposito);
router.post('/pasar-salon', pasarAlSalon);
router.post('/:id/reponer', reponerStock);
router.post('/:id/retirar', admin, retirarStock);
router.post('/intercambio', intercambiarProducto);
router.put('/:id/restaurar', admin, restaurarProducto);
router.delete('/:id/definitivo', admin, eliminarDefinitivo);
router.delete('/:id', admin, eliminarProducto);

export default router;
