import StockMovement from './StockMovementModel.js';

export const getStockMovements = async (req, res, next) => {
  try {
    const { producto, tipo, desde, hasta, limit = 100 } = req.query;
    const filter = {};

    if (producto) filter.producto = producto;
    if (tipo) filter.tipo = tipo;

    if (desde || hasta) {
      filter.createdAt = {};
      if (desde) filter.createdAt.$gte = new Date(`${desde}T00:00:00.000`);
      if (hasta) filter.createdAt.$lte = new Date(`${hasta}T23:59:59.999`);
    }

    const limite = Math.min(Math.max(Number(limit) || 100, 1), 500);

    const movimientos = await StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .limit(limite);

    res.json(movimientos);
  } catch (error) {
    next(error);
  }
};
