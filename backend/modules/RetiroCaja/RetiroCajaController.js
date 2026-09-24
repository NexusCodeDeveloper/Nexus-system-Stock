import mongoose from 'mongoose';
import RetiroCaja from './RetiroCajaModel.js';
import RetiroCajaDia from './RetiroCajaDiaModel.js';
import Venta from '../Venta/VentaModel.js';
import Devolucion from '../Devolucion/DevolucionModel.js';
import { schemaCrearRetiroCaja } from './RetiroCajaSchema.js';
import { obtenerRango } from '../../utils/FechasUtils.js';
import { enviarEvento } from '../../services/PushService.js';
import { mensajeCierre, verificarOperacionNoEnCierre, MENSAJE_CIERRE_EN_CURSO } from '../../utils/CierresUtils.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/CajaUtils.js';
import logger from '../../utils/LoggerUtils.js';

const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

const efectivoDeVenta = (venta) => {
  if (venta.pagos && venta.pagos.length > 0) {
    return venta.pagos
      .filter((p) => p.metodo === 'efectivo')
      .reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
  }
  const metodo = venta.metodoPago || 'efectivo';
  return metodo === 'efectivo' ? Number(venta.total) || 0 : 0;
};

const calcularRetiradoReal = async (desde, hasta, session = null) => {
  const query = RetiroCaja.find({ fechaCreacion: { $gte: desde, $lt: hasta } }).select('monto');
  if (session) query.session(session);
  const retiros = await query;
  return redondear(retiros.reduce((sum, r) => sum + (Number(r.monto) || 0), 0));
};

const calcularEfectivoVendido = async (desde, hasta, session = null) => {
  const query = Venta.find({ fechaCreacion: { $gte: desde, $lt: hasta }, estado: { $ne: 'devuelta' } }).select('pagos metodoPago total estado');
  if (session) query.session(session);
  const sales = await query;
  const ventas = sales.reduce((sum, s) => sum + efectivoDeVenta(s), 0);

  const queryDevoluciones = Devolucion.find({ fechaCreacion: { $gte: desde, $lt: hasta }, efectivoDevuelto: { $gt: 0 } }).select('efectivoDevuelto');
  if (session) queryDevoluciones.session(session);
  const devoluciones = await queryDevoluciones;
  const reintegros = devoluciones.reduce((sum, r) => sum + (Number(r.efectivoDevuelto) || 0), 0);

  return Math.max(0, redondear(ventas - reintegros));
};

const obtenerOffset = (req) => {
  const raw = req.body?.offset ?? req.query?.offset;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
};

export const obtenerDisponibleCaja = async (req, res, next) => {
  try {
    const caja = await buscarCajaAbierta();
    if (!caja) {
      return res.json({ disponible: 0, cajaAbierta: false, esDeHoy: false });
    }
    if (!cajaEsDeHoy(caja, obtenerOffset(req))) {
      return res.json({
        disponible: 0,
        cajaAbierta: true,
        esDeHoy: false,
        message: mensajeCajaAnterior(caja),
      });
    }
    const hasta = new Date();
    const desde = caja.abiertaEn || caja.fecha;
    const efectivoVendido = await calcularEfectivoVendido(desde, hasta);
    const retirado = await calcularRetiradoReal(desde, hasta);
    const disponible = Math.max(0, redondear((caja.fondoInicial || 0) + efectivoVendido - retirado));
    res.json({ disponible, cajaAbierta: true, esDeHoy: true });
  } catch (error) {
    next(error);
  }
};

export const crearRetiroCaja = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    const data = schemaCrearRetiroCaja.parse(req.body);
    const realizadoPor = req.usuario.nombre;
    const montoRedondo = redondear(data.monto);

    session.startTransaction();

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de retirar efectivo tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, obtenerOffset(req))) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const desde = caja.abiertaEn || caja.fecha;
    const hasta = new Date();
    const fondo = caja.fondoInicial || 0;
    const efectivoVendido = await calcularEfectivoVendido(desde, hasta, session);
    const retiradoReal = await calcularRetiradoReal(desde, hasta, session);
    const disponible = Math.max(0, redondear(fondo + efectivoVendido - retiradoReal));
    if (montoRedondo > disponible) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    await RetiroCajaDia.updateOne(
      { caja: caja._id },
      { $setOnInsert: { caja: caja._id, retirado: retiradoReal } },
      { upsert: true, session }
    );

    const topeDelDia = redondear(fondo + efectivoVendido - montoRedondo);
    const contador = await RetiroCajaDia.findOneAndUpdate(
      { caja: caja._id, retirado: { $lte: topeDelDia } },
      { $inc: { retirado: montoRedondo } },
      { new: true, session }
    );

    if (!contador) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `No hay suficiente efectivo en caja. Disponible: $${disponible.toFixed(2)}`,
      });
    }

    const creado = await RetiroCaja.create([{ ...data, monto: montoRedondo, realizadoPor, caja: caja._id }], { session });
    const withdrawal = creado[0];

    await session.commitTransaction();

    void enviarEvento({
      tipo: 'retiro',
      titulo: 'Retiro de efectivo',
      mensaje: `$${montoRedondo.toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${data.motivo} · ${realizadoPor}`,
      url: '/sales',
      para: { usuarioId: req.usuario.id, nombre: realizadoPor },
    });

    res.status(201).json(withdrawal);
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const obtenerRetirosCaja = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0 } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.fechaCreacion = obtenerRango(desde, hasta, offset);
    }

    const retiros = await RetiroCaja.find(filter).sort({ fechaCreacion: -1 });
    const total = redondear(retiros.reduce((sum, w) => sum + w.monto, 0));

    res.json({ retiros, total });
  } catch (error) {
    next(error);
  }
};

export const eliminarRetiroCaja = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const withdrawal = await RetiroCaja.findById(req.params.id).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Retiro no encontrado' });
    }

    const verificacion = await verificarOperacionNoEnCierre(withdrawal.fechaCreacion, session);
    if (verificacion.bloqueado) {
      await session.abortTransaction();
      return res.status(409).json({
        message: verificacion.motivo === 'cerrando'
          ? MENSAJE_CIERRE_EN_CURSO
          : `No se puede eliminar un retiro que ya forma parte de un cierre.${mensajeCierre(verificacion.cierre)}`,
      });
    }

    const monto = redondear(withdrawal.monto);
    let cajaId = withdrawal.caja;
    let desdeCaja = null;
    if (!cajaId) {
      const abierta = await buscarCajaAbierta(session);
      if (abierta && new Date(withdrawal.fechaCreacion) >= new Date(abierta.abiertaEn || abierta.fecha)) {
        cajaId = abierta._id;
        desdeCaja = abierta.abiertaEn || abierta.fecha;
      }
    }

    if (cajaId) {
      const existe = await RetiroCajaDia.exists({ caja: cajaId }).session(session);
      if (existe) {
        const contador = await RetiroCajaDia.findOneAndUpdate(
          { caja: cajaId, retirado: { $gte: monto } },
          { $inc: { retirado: -monto } },
          { new: true, session }
        );
        if (!contador) {
          await session.abortTransaction();
          return res.status(409).json({
            message: 'El contador de retiros de la caja no coincide con este retiro. Revisá el efectivo antes de eliminarlo.',
          });
        }
      } else {
        const filtro = withdrawal.caja
          ? { caja: cajaId }
          : { fechaCreacion: { $gte: desdeCaja, $lt: new Date() } };
        const query = RetiroCaja.find(filtro).select('monto');
        query.session(session);
        const retiros = await query;
        const total = redondear(retiros.reduce((sum, r) => sum + (Number(r.monto) || 0), 0));
        await RetiroCajaDia.updateOne(
          { caja: cajaId },
          { $setOnInsert: { caja: cajaId, retirado: Math.max(0, redondear(total - monto)) } },
          { upsert: true, session }
        );
      }
    } else {
      logger.warn('Retiro eliminado sin caja asociada', {
        motivo: 'El retiro no tiene caja y no coincide con la caja abierta',
        queRevisar: 'Verificá el disponible de caja del día; puede ser un retiro anterior a la migración.',
        origen: 'backend',
        lugar: 'RetiroCajaController.js → eliminarRetiroCaja',
      });
    }

    await RetiroCaja.deleteOne({ _id: withdrawal._id }).session(session);
    await session.commitTransaction();

    res.json({ message: 'Retiro eliminado correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};
