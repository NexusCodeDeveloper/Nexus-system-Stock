import CashWithdrawal from './CashWithdrawalModel.js';
import Sale from '../Sale/SaleModel.js';
import { createCashWithdrawalSchema } from './CashWithdrawalSchema.js';

const parseDate = (str, offset = 0) => {
  if (!str) return null;
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return new Date(dt.getTime() + Number(offset) * 60000);
};

const getRange = (start, end, offset = 0) => {
  const off = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  const from = parseDate(start, off);
  const to = parseDate(end, off);
  if (start && !from) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }
  if (end && !to) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }
  return {
    $gte: from || new Date(0),
    $lt: to ? new Date(to.getTime() + 86400000) : new Date(8640000000000000),
  };
};

const startOfDayDate = (offset = 0) => {
  const local = new Date(Date.now() - Number(offset) * 60000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  return new Date(Date.UTC(y, m - 1, d) + Number(offset) * 60000);
};

const getEfectivoDeVenta = (sale) => {
  if (sale.pagos && sale.pagos.length > 0) {
    return sale.pagos
      .filter((p) => p.metodo === 'efectivo')
      .reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  }
  const metodo = sale.metodoPago || 'efectivo';
  return metodo === 'efectivo' ? Number(sale.total) || 0 : 0;
};

const calcularEfectivoDisponible = async (offset = 0) => {
  const desde = startOfDayDate(offset);
  const hasta = new Date();

  const sales = await Sale.find({ createdAt: { $gte: desde, $lt: hasta } }).select('pagos metodoPago total');
  const efectivoVendido = sales.reduce((sum, s) => sum + getEfectivoDeVenta(s), 0);

  const retiros = await CashWithdrawal.find({ createdAt: { $gte: desde, $lt: hasta } }).select('monto');
  const retirado = retiros.reduce((sum, r) => sum + (Number(r.monto) || 0), 0);

  return Math.max(0, Math.round((efectivoVendido - retirado) * 100) / 100);
};

export const getAvailableCash = async (req, res, next) => {
  try {
    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0;
    const disponible = await calcularEfectivoDisponible(offset);
    res.json({ disponible });
  } catch (error) {
    next(error);
  }
};

export const createCashWithdrawal = async (req, res, next) => {
  try {
    const data = createCashWithdrawalSchema.parse(req.body);
    const offset = Number.isFinite(Number(req.body.offset)) ? Number(req.body.offset) : 0;

    const disponible = await calcularEfectivoDisponible(offset);
    if (data.monto > disponible) {
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    const withdrawal = await CashWithdrawal.create(data);
    res.status(201).json(withdrawal);
  } catch (error) {
    next(error);
  }
};

export const getCashWithdrawals = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0 } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const withdrawals = await CashWithdrawal.find(filter).sort({ createdAt: -1 });
    const total = withdrawals.reduce((sum, w) => sum + w.monto, 0);

    res.json({ withdrawals, total });
  } catch (error) {
    next(error);
  }
};

export const deleteCashWithdrawal = async (req, res, next) => {
  try {
    const withdrawal = await CashWithdrawal.findByIdAndDelete(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }
    res.json({ message: 'Retiro eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};