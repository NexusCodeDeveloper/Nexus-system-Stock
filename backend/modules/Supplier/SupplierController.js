import Supplier from './SupplierModel.js';
import { createSupplierSchema, updateSupplierSchema } from './SupplierSchema.js';

export const getSuppliers = async (req, res, next) => {
  try {
    const suppliers = await Supplier.find().sort({ nombre: 1 });
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
};

export const getSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(supplier);
  } catch (error) {
    next(error);
  }
};

export const createSupplier = async (req, res, next) => {
  try {
    const data = createSupplierSchema.parse(req.body);
    const supplier = await Supplier.create(data);
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const data = updateSupplierSchema.parse(req.body);
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(supplier);
  } catch (error) {
    next(error);
  }
};

export const deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json({ message: 'Proveedor eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};
