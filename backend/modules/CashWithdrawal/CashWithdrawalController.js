import mongoose from 'mongoose';
import CashWithdrawal from './CashWithdrawalModel.js';
import CashWithdrawalDay from './CashWithdrawalDayModel.js';
import Sale from '../Sale/SaleModel.js';
import Return from '../Return/ReturnModel.js';
import { createCashWithdrawalSchema } from './CashWithdrawalSchema.js';
import { getRange } from '../../utils/fechas.js';
import { enviarEvento } from '../../services/pushService.js';
import { encontrarCierreDeFecha, mensajeCierre } from '../../utils/cierres.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/caja.js';
import logger from '../../utils/logger.js';

const getEfectivoDeVenta = (sale) => {
  if (sale.pagos && sale.pagos.length > 0) {
    return sale.pagos
      .filter((p) => p.metodo === 'efectivo')
      .reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  }
  const metodo = sale.metodoPago || 'efectivo';
  return metodo === 'efectivo' ? Number(sale.total) || 0 : 0;
};

const calcularRetiradoReal = async (desde, hasta, session = null) => {
  const query = CashWithdrawal.find({ createdAt: { $gte: desde, $lt: hasta } }).select('monto');
  if (session) query.session(session);
  const retiros = await query;
  return Math.round(retiros.reduce((sum, r) => sum + (Number(r.monto) || 0), 0) * 100) / 100;
};

const calcularEfectivoVendido = async (desde, hasta, session = null) => {
  const query = Sale.find({ createdAt: { $gte: desde, $lt: hasta }, estado: { $ne: 'devuelta' } }).select('pagos metodoPago total estado');
  if (session) query.session(session);
  const sales = await query;
  const ventas = sales.reduce((sum, s) => sum + getEfectivoDeVenta(s), 0);

  const queryDevoluciones = Return.find({ createdAt: { $gte: desde, $lt: hasta }, efectivoDevuelto: { $gt: 0 } }).select('efectivoDevuelto');
  if (session) queryDevoluciones.session(session);
  const devoluciones = await queryDevoluciones;
  const reintegros = devoluciones.reduce((sum, r) => sum + (Number(r.efectivoDevuelto) || 0), 0);

  return Math.max(0, Math.round((ventas - reintegros) * 100) / 100);
};

const getOffset = (req) => {
  const raw = req.body?.offset ?? req.query?.offset;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
};

export const getAvailableCash = async (req, res, next) => {
  try {
    const caja = await buscarCajaAbierta();
    if (!caja) {
      return res.json({ disponible: 0, cajaAbierta: false });
    }
    const hasta = new Date();
    const desde = caja.abiertoAt || caja.fecha;
    const efectivoVendido = await calcularEfectivoVendido(desde, hasta);
    const retirado = await calcularRetiradoReal(desde, hasta);
    const disponible = Math.max(
      0,
      Math.round(((caja.fondoInicial || 0) + efectivoVendido - retirado) * 100) / 100
    );
    res.json({ disponible, cajaAbierta: true });
  } catch (error) {
    next(error);
  }
};

export const createCashWithdrawal = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    const data = createCashWithdrawalSchema.parse(req.body);
    const offset = getOffset(req);
    const realizadoPor = req.user.nombre;

    const dayKey = (() => {
      const d = new Date(Date.now() - offset * 60000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    })();

    const montoRedondo = Math.round(data.monto * 100) / 100;

    session.startTransaction();

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de retirar efectivo tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, offset)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey },
      { $setOnInsert: { fecha: dayKey, retirado: 0 } },
      { upsert: true, session }
    );

    const desde = caja.abiertoAt || caja.fecha;
    const hasta = new Date();
    const fondo = caja.fondoInicial || 0;
    const efectivoVendido = await calcularEfectivoVendido(desde, hasta, session);
    const retiradoReal = await calcularRetiradoReal(desde, hasta, session);
    const disponible = Math.max(0, Math.round((fondo + efectivoVendido - retiradoReal) * 100) / 100);
    if (montoRedondo > disponible) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    const topeDelDia = Math.round((fondo + efectivoVendido - montoRedondo) * 100) / 100;
    const dayRecord = await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey, retirado: { $lte: topeDelDia } },
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
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
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const withdrawal = await CashWithdrawal.findById(req.params.id).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    const cierre = await encontrarCierreDeFecha(withdrawal.createdAt);
    if (cierre) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `No se puede eliminar un retiro que ya forma parte de un cierre.${mensajeCierre(cierre)}`,
      });
    }

    const offset = getOffset(req);
    const d = new Date(withdrawal.createdAt.getTime() - offset * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    const dayKey = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const monto = Math.round(withdrawal.monto * 100) / 100;

    const actualizado = await CashWithdrawalDay.findOneAndUpdate(
      { fecha: dayKey, retirado: { $gte: monto } },
      { $inc: { retirado: -monto } },
      { new: true, session }
    );

    if (!actualizado) {
      const dayRecord = await CashWithdrawalDay.findOne({ fecha: dayKey }).session(session);
      if (dayRecord) {
        await session.abortTransaction();
        return res.status(409).json({
          message: 'El contador de retiros del día no coincide con este retiro. Revisá el efectivo antes de eliminarlo.',
        });
      }
      logger.warn('Retiro eliminado sin contador diario asociado', {
        motivo: `No existe CashWithdrawalDay para ${dayKey}`,
        queRevisar: 'Verificá el disponible de caja del día; puede ser un retiro anterior a la migración.',
        origen: 'backend',
        lugar: 'CashWithdrawalController.js → deleteCashWithdrawal',
      });
    }

    await CashWithdrawal.deleteOne({ _id: withdrawal._id }).session(session);
    await session.commitTransaction();

    res.json({ message: 'Retiro eliminado correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};