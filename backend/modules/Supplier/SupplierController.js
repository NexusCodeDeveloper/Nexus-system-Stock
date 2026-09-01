import Supplier from './SupplierModel.js';
import { createSupplierSchema, updateSupplierSchema } from './SupplierSchema.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findDuplicado = (nombre, excluirId) => {
  const filter = { nombre: { $regex: `^${escapeRegex(nombre.trim())}$`, $options: 'i' } };
  if (excluirId) filter._id = { $ne: excluirId };
  return Supplier.findOne(filter);
};

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
    const duplicado = await findDuplicado(data.nombre);
    if (duplicado) {
      return res.status(409).json({ message: `Ya existe un proveedor llamado "${data.nombre}"` });
    }
    const supplier = await Supplier.create(data);
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const data = updateSupplierSchema.parse(req.body);
    if (data.nombre) {
      const duplicado = await findDuplicado(data.nombre, req.params.id);
      if (duplicado) {
        return res.status(409).json({ message: `Ya existe un proveedor llamado "${data.nombre}"` });
      }
    }
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
