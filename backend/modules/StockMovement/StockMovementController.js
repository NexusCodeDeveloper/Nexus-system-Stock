import mongoose from 'mongoose';
import StockMovement from './StockMovementModel.js';

const TIPOS = StockMovement.schema.path('tipo').enumValues;

const fechaValida = (str) => {
  const s = String(str);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getStockMovements = async (req, res, next) => {
  try {
    const { producto, tipo, desde, hasta, buscar, limit = 100, offset = 0 } = req.query;
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
      if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta))) {
        return res.status(400).json({ message: 'Fecha inválida' });
      }
      filter.createdAt = {};
      if (desde) filter.createdAt.$gte = new Date(`${desde}T00:00:00.000`);
      if (hasta) filter.createdAt.$lte = new Date(`${hasta}T23:59:59.999`);
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
