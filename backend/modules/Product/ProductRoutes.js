import { Router } from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getDashboardStats,
  sellProduct,
  exchangeProduct,
  addStock,
  migrateVariants,
  getLowStock,
} from './ProductController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/low-stock', getLowStock);
router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', admin, createProduct);
router.put('/:id', admin, updateProduct);
router.put('/:id/sell', sellProduct);
router.put('/:id/add-stock', admin, addStock);
router.post('/exchange', exchangeProduct);
router.delete('/:id', admin, deleteProduct);
router.post('/migrate-variants', admin, migrateVariants);

export default router;
