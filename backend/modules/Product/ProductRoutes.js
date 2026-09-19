import { Router } from 'express';
import {
  getProducts,
  getProduct,
  getProductByCodigo,
  siguienteCodigo,
  createProduct,
  updateProduct,
  deleteProduct,
  getDashboardStats,
  exchangeProduct,
  addStock,
  addDeposito,
  reponerStock,
  pasarAlSalon,
  retirarStock,
  getLowStock,
} from './ProductController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/low-stock', getLowStock);
router.get('/codigo/:codigo', getProductByCodigo);
router.get('/siguiente-codigo', admin, siguienteCodigo);
router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', admin, createProduct);
router.put('/:id', admin, updateProduct);
router.put('/:id/add-stock', admin, addStock);
router.put('/:id/deposito', admin, addDeposito);
router.post('/pasar-salon', pasarAlSalon);
router.post('/:id/reponer', reponerStock);
router.post('/:id/retirar', admin, retirarStock);
router.post('/exchange', exchangeProduct);
router.delete('/:id', admin, deleteProduct);

export default router;
