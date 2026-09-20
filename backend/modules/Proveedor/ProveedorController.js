import Proveedor from './ProveedorModel.js';
import { schemaCrearProveedor, schemaActualizarProveedor } from './ProveedorSchema.js';

const escaparRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const encontrarDuplicado = (nombre, excluirId) => {
  const filter = { nombre: { $regex: `^${escaparRegex(nombre.trim())}$`, $options: 'i' } };
  if (excluirId) filter._id = { $ne: excluirId };
  return Proveedor.findOne(filter);
};

export const obtenerProveedores = async (req, res, next) => {
  try {
    const proveedores = await Proveedor.find().sort({ nombre: 1 });
    res.json(proveedores);
  } catch (error) {
    next(error);
  }
};

export const obtenerProveedor = async (req, res, next) => {
  try {
    const supplier = await Proveedor.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(supplier);
  } catch (error) {
    next(error);
  }
};

export const crearProveedor = async (req, res, next) => {
  try {
    const data = schemaCrearProveedor.parse(req.body);
    const duplicado = await encontrarDuplicado(data.nombre);
    if (duplicado) {
      return res.status(409).json({ message: `Ya existe un proveedor llamado "${data.nombre}"` });
    }
    const supplier = await Proveedor.create(data);
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
};

export const actualizarProveedor = async (req, res, next) => {
  try {
    const data = schemaActualizarProveedor.parse(req.body);
    if (data.nombre) {
      const duplicado = await encontrarDuplicado(data.nombre, req.params.id);
      if (duplicado) {
        return res.status(409).json({ message: `Ya existe un proveedor llamado "${data.nombre}"` });
      }
    }
    const supplier = await Proveedor.findByIdAndUpdate(req.params.id, data, {
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

export const eliminarProveedor = async (req, res, next) => {
  try {
    const supplier = await Proveedor.findByIdAndDelete(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json({ message: 'Proveedor eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};
