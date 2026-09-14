import mongoose from 'mongoose';
import CashWithdrawal from './CashWithdrawalModel.js';
import CashWithdrawalDay from './CashWithdrawalDayModel.js';
import Sale from '../Sale/SaleModel.js';
import { createCashWithdrawalSchema } from './CashWithdrawalSchema.js';
import { enviarEvento } from '../../services/pushService.js';

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

const calcularRetiradoReal = async (offset = 0, session = null) => {
  const desde = startOfDayDate(offset);
  const hasta = new Date();
  const query = CashWithdrawal.find({ createdAt: { $gte: desde, $lt: hasta } }).select('monto');
  if (session) query.session(session);
  const retiros = await query;
  return Math.round(retiros.reduce((sum, r) => sum + (Number(r.monto) || 0), 0) * 100) / 100;
};

const calcularEfectivoDisponible = async (offset = 0, session = null) => {
  const desde = startOfDayDate(offset);
  const hasta = new Date();

  const query = Sale.find({ createdAt: { $gte: desde, $lt: hasta }, estado: { $ne: 'devuelta' } }).select('pagos metodoPago total estado');
  if (session) query.session(session);
  const sales = await query;
  const efectivoVendido = sales.reduce((sum, s) => sum + getEfectivoDeVenta(s), 0);

  const retirado = await calcularRetiradoReal(offset, session);

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
  const session = await mongoose.startSession();
  try {
    const data = createCashWithdrawalSchema.parse(req.body);
    const offset = Number.isFinite(Number(req.body.offset)) ? Number(req.body.offset) : 0;
    const realizadoPor = req.user.nombre;

    const dayKey = (() => {
      const d = new Date(Date.now() - offset * 60000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    })();

    const montoRedondo = Math.round(data.monto * 100) / 100;

    await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey },
      { $setOnInsert: { fecha: dayKey, retirado: 0 } },
      { upsert: true }
    );

    session.startTransaction();

    const disponible = await calcularEfectivoDisponible(offset, session);
    if (montoRedondo > disponible) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    const dayRecord = await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey, retirado: { $lte: Math.round((disponible - montoRedondo) * 100) / 100 } },
      { $inc: { retirado: montoRedondo } },
      { new: true, session }
    );

    if (!dayRecord) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    const creado = await CashWithdrawal.create([{ ...data, monto: montoRedondo, realizadoPor }], { session });
    const withdrawal = creado[0];

    await session.commitTransaction();

    void enviarEvento({
      tipo: 'retiro',
      titulo: 'Retiro de efectivo',
      mensaje: `$${montoRedondo.toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${data.motivo} · ${realizadoPor}`,
      url: '/sales',
      para: { userId: req.user.id, nombre: realizadoPor },
    });

    res.status(201).json(withdrawal);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
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
    const total = Math.round(withdrawals.reduce((sum, w) => sum + w.monto, 0) * 100) / 100;

    res.json({ withdrawals, total });
  } catch (error) {
    next(error);
  }
};

export const deleteCashWithdrawal = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const withdrawal = await CashWithdrawal.findById(req.params.id).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    const offset = Number.isFinite(Number(req.query.offset)) ? Number(req.query.offset) : 0;
    const d = new Date(withdrawal.createdAt.getTime() - offset * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    const dayKey = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const monto = Math.round(withdrawal.monto * 100) / 100;

    await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey, retirado: { $gte: monto } },
      { $inc: { retirado: -monto } },
      { session }
    );

    await CashWithdrawal.deleteOne({ _id: withdrawal._id }).session(session);
    await session.commitTransaction();

    res.json({ message: 'Retiro eliminado correctamente' });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};