import mongoose from 'mongoose';
import StockMovement from './StockMovementModel.js';
import { getRange } from '../../utils/fechas.js';

const TIPOS = StockMovement.schema.path('tipo').enumValues;

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getStockMovements = async (req, res, next) => {
  try {
    const { producto, tipo, desde, hasta, buscar, limit = 100, offset = 0, tz } = req.query;
    const filter = {};

    if (producto) {
      if (!mongoose.Types.ObjectId.isValid(producto)) {
        return res.status(400).json({ message: 'Producto inválido' });
      }
      filter.producto = producto;
    }
    if (tipo) {
      if (!TIPOS.includes(tipo)) {
        return res.status(400).json({ message: 'Tipo de movimiento inválido' });
      }
      filter.tipo = tipo;
    }
    if (buscar) {
      const safe = escapeRegex(String(buscar).trim());
      if (safe) {
        filter.productoNombre = { $regex: safe, $options: 'i' };
      }
    }

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, tz);
    }

    const limite = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const salto = Math.max(Number(offset) || 0, 0);

    const movimientos = await StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(salto)
      .limit(limite);

    res.json(movimientos);
  } catch (error) {
    next(error);
  }
};
