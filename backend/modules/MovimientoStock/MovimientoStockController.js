import mongoose from 'mongoose';
import MovimientoStock from './MovimientoStockModel.js';
import { obtenerRango } from '../../utils/FechasUtils.js';

const TIPOS = MovimientoStock.schema.path('tipo').enumValues;

const escaparRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const obtenerMovimientosStock = async (req, res, next) => {
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
      const safe = escaparRegex(String(buscar).trim());
      if (safe) {
        filter.productoNombre = { $regex: safe, $options: 'i' };
      }
    }

    if (desde || hasta) {
      filter.fechaCreacion = obtenerRango(desde, hasta, tz);
    }

    const limite = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const salto = Math.max(Number(offset) || 0, 0);

    const movimientos = await MovimientoStock.find(filter)
      .sort({ fechaCreacion: -1 })
      .skip(salto)
      .limit(limite);

    res.json(movimientos);
  } catch (error) {
    next(error);
  }
};
