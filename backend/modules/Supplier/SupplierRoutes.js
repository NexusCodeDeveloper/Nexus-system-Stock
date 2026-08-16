import { Router } from 'express';
import {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from './SupplierController.js';
import { protect, admin } from '../../middlewares/AuthMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', admin, getSuppliers);
router.get('/:id', admin, getSupplier);
router.post('/', admin, createSupplier);
router.put('/:id', admin, updateSupplier);
router.delete('/:id', admin, deleteSupplier);

export default router;
