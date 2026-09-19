import mongoose from 'mongoose';
import Sale from './SaleModel.js';
import Product from '../Product/ProductModel.js';
import Return from '../Return/ReturnModel.js';
import DailyClose from './DailyCloseModel.js';
import CashWithdrawal from '../CashWithdrawal/CashWithdrawalModel.js';
import { createSaleSchema, abrirCajaSchema, cerrarCajaSchema, reabrirCajaSchema } from './SaleSchema.js';
import { generarTicketNumero, guardarConTicketUnico } from './ticketUtils.js';
import { enviarCierreDeCaja, enviarMailTest, verificarMail } from '../../services/emailService.js';
import { enviarEvento, enviarStockBajo } from '../../services/pushService.js';
import { parseDate, getRange, startOfDayDate } from '../../utils/fechas.js';
import { findVariantIdx, extraDeposito } from '../../utils/variantes.js';
import { getItems, getUnidadesNetas, getTotalNeto } from '../../utils/ventas.js';
import { encontrarCierreDeFecha, mensajeCierre } from '../../utils/cierres.js';
import { buscarCajaAbierta, respuestaSinCaja, MENSAJE_SIN_CAJA, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/caja.js';
import logger from '../../utils/logger.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createSale = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = createSaleSchema.parse(req.body);

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de vender tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, Number(data.offset) || 0)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const items = [];
    const productosVendidos = [];
    const idsProductos = data.items.map((item) => item.producto);
    const productos = await Product.find({ _id: { $in: idsProductos } }).session(session);
    const productosPorId = new Map(productos.map((p) => [p._id.toString(), p]));

    for (const item of data.items) {
      const product = productosPorId.get(String(item.producto));
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.producto} no encontrado` });
      }
      productosVendidos.push(product);

      if (product.variants?.length > 0) {
        const idx = findVariantIdx(product, item.talle, item.color);
        if (idx === -1) {
          const label = [item.talle, item.color].filter(Boolean).join(' / ') || 'sin variante';
          await session.abortTransaction();
          return res.status(400).json({ message: `Variante "${label}" no encontrada en "${product.nombre}"` });
        }
        if (product.variants[idx].cantidad < item.cantidad) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Stock insuficiente para "${product.nombre}". Solo hay ${product.variants[idx].cantidad} unidad(es) en salón.${extraDeposito(product, item.talle, item.color)}`,
          });
        }
        product.variants[idx].cantidad -= item.cantidad;
      } else {
        if (product.cantidad < item.cantidad) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Stock insuficiente para "${product.nombre}". Solo hay ${product.cantidad} unidad(es) en salón.${extraDeposito(product, item.talle, item.color)}`,
          });
        }
        product.cantidad -= item.cantidad;
      }

      await product.save({ session });

      const precioUnitario = Math.round(product.precio * 100) / 100;
      items.push({
        producto: item.producto,
        cantidad: item.cantidad,
        precio: precioUnitario,
        talle: item.talle || '',
        color: item.color || '',
        subtotal: Math.round(precioUnitario * item.cantidad * 100) / 100,
      });
    }

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - (data.descuento || 0) / 100) * 100) / 100;

    const sumaPagos = (data.pagos || []).reduce((s, p) => s + p.monto, 0);
    if (Math.abs(sumaPagos - total) > 0.01) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `La suma de los montos de pago ($${sumaPagos.toFixed(2)}) no coincide con el total ($${total.toFixed(2)})`,
      });
    }

    const sale = await Sale.create([{
      items,
      total,
      empleado: req.user.nombre,
      pagos: data.pagos,
      descuento: data.descuento || 0,
    }], { session });

    const savedSale = await guardarConTicketUnico(sale[0], session);

    const populated = await Sale.findById(savedSale._id)
      .session(session)
      .populate('items.producto', 'nombre codigo');

    await session.commitTransaction();

    void enviarStockBajo(productosVendidos);
    void enviarEvento({
      tipo: 'venta',
      titulo: 'Nueva venta',
      mensaje: `$${Number(total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${req.user.nombre}`,
      url: '/sales',
      para: { userId: req.user.id, nombre: req.user.nombre },
    });

    res.status(201).json(populated);
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const deleteSale = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const sale = await Sale.findById(req.params.id).session(session);
    if (!sale) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    if (sale.estado === 'devuelta') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede eliminar una venta ya devuelta' });
    }

    const cierre = await encontrarCierreDeFecha(sale.createdAt);
    if (cierre) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `No se puede eliminar una venta que ya forma parte de un cierre.${mensajeCierre(cierre)}`,
      });
    }

    const items = getItems(sale);

    const returnCount = await Return.countDocuments({
      $or: [{ sale: sale._id }, { ventaDiferenciaId: sale._id }],
    }).session(session);
    if (returnCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede eliminar la venta porque tiene devoluciones o cambios asociados' });
    }

    const idsProductos = items.map((item) => item.producto).filter(Boolean);
    const productos = await Product.find({ _id: { $in: idsProductos } }).session(session);
    const productosPorId = new Map(productos.map((p) => [p._id.toString(), p]));
    const modificados = new Map();

    for (const item of items) {
      const product = item.producto ? productosPorId.get(String(item.producto)) : null;
      if (!product) continue;
      if (product.variants?.length > 0) {
        const idx = findVariantIdx(product, item.talle, item.color);
        if (idx === -1) {
          product.variants.push({ talle: item.talle || '', color: item.color || '', cantidad: item.cantidad });
        } else {
          product.variants[idx].cantidad += item.cantidad;
        }
      } else {
        product.cantidad += item.cantidad;
      }
      modificados.set(product._id.toString(), product);
    }

    for (const product of modificados.values()) {
      await product.save({ session });
    }

    await Sale.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const getSales = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, numero, codigo, buscar } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const numeroStr = String(numero || '').trim();
    if (numeroStr) {
      filter.ticketNumero = { $regex: escapeRegex(numeroStr), $options: 'i' };
    }

    const or = [];
    const codigoStr = String(codigo || '').trim();
    if (codigoStr) {
      const product = await Product.findOne({
        codigo: { $regex: `^${escapeRegex(codigoStr)}$`, $options: 'i' },
      })
        .select('_id')
        .lean();
      if (!product) {
        return res.json({ sales: [], total: 0 });
      }
      or.push({ 'items.producto': product._id }, { producto: product._id });
    }

    const buscarStr = String(buscar || '').trim();
    if (buscarStr) {
      const safe = escapeRegex(buscarStr);
      or.push({ ticketNumero: { $regex: `^(T-)?${safe}`, $options: 'i' } });
      const product = await Product.findOne({
        codigo: { $regex: `^${safe}$`, $options: 'i' },
      })
        .select('_id')
        .lean();
      if (product) {
        or.push({ 'items.producto': product._id }, { producto: product._id });
      }
    }
    if (or.length > 0) {
      filter.$or = or;
    }

    const sales = await Sale.find(filter)
      .populate('items.producto', 'nombre categoria codigo')
      .populate('producto', 'nombre categoria codigo')
      .sort({ createdAt: -1 });

    const total = Math.round(sales.reduce((sum, s) => sum + getTotalNeto(s), 0) * 100) / 100;

    res.json({ sales, total });
  } catch (error) {
    next(error);
  }
};

export const getMostSold = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, limit = 5 } = req.query;
    const limite = Math.min(Math.max(Number(limit) || 5, 1), 50);
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const sales = await Sale.find(filter);

    const productMap = {};
    for (const sale of sales) {
      if (sale.estado === 'devuelta') continue;
      const esLegacy = !(sale.items && sale.items.length > 0);
      const devueltoLegacy = esLegacy ? (sale.cantidadDevuelta || 0) : 0;
      const items = getItems(sale);
      for (const item of items) {
        if (!item.producto) continue;
        const pid = String(item.producto);
        if (!productMap[pid]) productMap[pid] = { totalVendido: 0, ingresos: 0 };
        const cantEfectiva = Math.max(0, (item.cantidad || 0) - devueltoLegacy);
        if (cantEfectiva === 0) continue;
        productMap[pid].totalVendido += cantEfectiva;
        const itemSubtotal = item.subtotal || (item.cantidad * (item.precio || 0));
        const ratio = sale.total > 0 ? itemSubtotal / sale.total : 1 / items.length;
        productMap[pid].ingresos += sale.total * ratio * (cantEfectiva / (item.cantidad || 1));
      }
    }

    const sorted = Object.entries(productMap)
      .map(([productoId, data]) => ({ productoId, ...data }))
      .sort((a, b) => b.totalVendido - a.totalVendido)
      .slice(0, limite);

    const products = await Product.find({ _id: { $in: sorted.map(r => r.productoId) } });
    const productNames = {};
    for (const p of products) {
      productNames[p._id.toString()] = { nombre: p.nombre, categoria: p.categoria };
    }

    res.json(sorted.map(r => ({
      ...r,
      nombre: productNames[r.productoId]?.nombre || 'Producto eliminado',
      categoria: productNames[r.productoId]?.categoria || '',
    })));
  } catch (error) {
    next(error);
  }
};

const calcularResumenCaja = async (caja) => {
  const desdeAt = caja.abiertoAt || caja.fecha;
  const hastaAt = caja.cerradoAt || new Date();

  const sales = await Sale.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } })
    .populate('items.producto', 'nombre categoria')
    .populate('producto', 'nombre categoria');

  const retiros = await CashWithdrawal.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } }).sort({ createdAt: 1 });
  const totalRetiros = Math.round(retiros.reduce((sum, r) => sum + r.monto, 0) * 100) / 100;

  const devoluciones = await Return.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } });
  const totalDevoluciones = Math.round(devoluciones.reduce((sum, r) => sum + (r.montoDevuelto || 0), 0) * 100) / 100;
  const efectivoDevuelto = Math.round(devoluciones.reduce((sum, r) => sum + (r.efectivoDevuelto || 0), 0) * 100) / 100;

  const total = Math.round(sales.reduce((sum, s) => sum + getTotalNeto(s), 0) * 100) / 100;
  const cantidad = sales.reduce((sum, s) => sum + getUnidadesNetas(s), 0);

  const porMetodo = sales.reduce((acc, s) => {
    const unidadesNetas = getUnidadesNetas(s);
    if (unidadesNetas <= 0) return acc;
    if (s.pagos && s.pagos.length > 0) {
      const totalPagado = s.pagos.reduce((sum, p) => sum + p.monto, 0);
      if (totalPagado <= 0) return acc;
      let asignadas = 0;
      for (let i = 0; i < s.pagos.length; i++) {
        const p = s.pagos[i];
        if (!acc[p.metodo]) acc[p.metodo] = { total: 0, cantidad: 0 };
        acc[p.metodo].total += p.monto;
        const parte = i === s.pagos.length - 1
          ? unidadesNetas - asignadas
          : Math.round(unidadesNetas * (p.monto / totalPagado));
        acc[p.metodo].cantidad += parte;
        asignadas += parte;
      }
    } else {
      const m = s.metodoPago || 'efectivo';
      if (!acc[m]) acc[m] = { total: 0, cantidad: 0 };
      acc[m].total += s.total;
      acc[m].cantidad += unidadesNetas;
    }
    return acc;
  }, {});

  const fondo = caja.fondoInicial || 0;
  const efectivoEsperado = Math.max(
    0,
    Math.round((fondo + (porMetodo.efectivo?.total || 0) - totalRetiros - efectivoDevuelto) * 100) / 100
  );

  return {
    desdeAt,
    hastaAt,
    sales,
    retiros,
    totalRetiros,
    totalDevoluciones,
    efectivoDevuelto,
    total,
    cantidad,
    porMetodo,
    fondo,
    efectivoEsperado,
  };
};

const resumenParaRespuesta = (resumen) => ({
  desdeAt: resumen.desdeAt,
  total: resumen.total,
  cantidad: resumen.cantidad,
  efectivo: { total: resumen.porMetodo.efectivo?.total || 0, cantidad: resumen.porMetodo.efectivo?.cantidad || 0 },
  transferencia: { total: resumen.porMetodo.transferencia?.total || 0, cantidad: resumen.porMetodo.transferencia?.cantidad || 0 },
  tarjeta: { total: resumen.porMetodo.tarjeta?.total || 0, cantidad: resumen.porMetodo.tarjeta?.cantidad || 0 },
  totalRetiros: resumen.totalRetiros,
  totalDevoluciones: resumen.totalDevoluciones,
  efectivoDevuelto: resumen.efectivoDevuelto,
  fondoInicial: resumen.fondo,
  efectivoEsperado: resumen.efectivoEsperado,
});

export const abrirCaja = async (req, res, next) => {
  try {
    const data = abrirCajaSchema.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;
    const fechaDate = startOfDayDate(offset);

    const abierta = await buscarCajaAbierta();
    if (abierta) {
      const fecha = new Date(abierta.fecha).toLocaleDateString('es-AR');
      return res.status(409).json({
        message: `Ya hay una caja abierta del ${fecha} por ${abierta.abiertoPor || 'otro usuario'}. Cerrala antes de abrir una nueva.`,
      });
    }

    const yaCerrada = await DailyClose.findOne({ fecha: fechaDate, turno: 'dia', estado: { $ne: 'abierto' } });
    if (yaCerrada) {
      return res.status(409).json({ message: 'La caja de hoy ya fue cerrada.' });
    }

    let caja;
    try {
      caja = await DailyClose.create({
        fecha: fechaDate,
        turno: 'dia',
        estado: 'abierto',
        abiertoAt: new Date(),
        abiertoPor: data.nombre,
        abiertoPorUsuario: req.user?.nombre || '',
        fondoInicial: data.fondoInicial || 0,
        total: 0,
        cantidad: 0,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ message: 'La caja de hoy ya fue abierta.' });
      }
      throw error;
    }

    void enviarEvento({
      tipo: 'cierre',
      titulo: 'Caja abierta',
      mensaje: `${data.nombre} abrió la caja${data.fondoInicial > 0 ? ` con un fondo de $${Number(data.fondoInicial).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : ''}`,
      url: '/sales',
      para: 'admins',
    });

    res.status(201).json(caja);
  } catch (error) {
    next(error);
  }
};

export const getCajaAbierta = async (req, res, next) => {
  try {
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
    const hoy = startOfDayDate(offset);
    const cierreHoy = await DailyClose.findOne({ fecha: hoy, turno: 'dia', estado: 'cerrado' })
      .select('_id fecha cerradoAt cerradoPor total cantidad reaperturas');

    const caja = await buscarCajaAbierta();
    if (!caja) {
      return res.json({ caja: null, resumen: null, cierreHoy, esDeHoy: false });
    }
    const resumen = await calcularResumenCaja(caja);
    res.json({
      caja,
      resumen: resumenParaRespuesta(resumen),
      cierreHoy: null,
      esDeHoy: cajaEsDeHoy(caja, offset),
    });
  } catch (error) {
    next(error);
  }
};

export const cerrarCaja = async (req, res, next) => {
  try {
    const data = cerrarCajaSchema.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;

    const caja = await buscarCajaAbierta();
    if (!caja) {
      return res.status(409).json({ message: 'No hay una caja abierta para cerrar' });
    }

    const resumen = await calcularResumenCaja(caja);
    const cerradoAt = new Date();

    const actualizada = await DailyClose.findOneAndUpdate(
      { _id: caja._id, estado: 'abierto' },
      {
        $set: {
          estado: 'cerrado',
          cerradoAt,
          cerradoPor: data.nombre,
          cerradoPorUsuario: req.user?.nombre || '',
          desdeAt: resumen.desdeAt,
          hastaAt: cerradoAt,
          total: resumen.total,
          cantidad: resumen.cantidad,
          efectivo: {
            total: resumen.porMetodo.efectivo?.total || 0,
            cantidad: resumen.porMetodo.efectivo?.cantidad || 0,
          },
          transferencia: {
            total: resumen.porMetodo.transferencia?.total || 0,
            cantidad: resumen.porMetodo.transferencia?.cantidad || 0,
          },
          tarjeta: {
            total: resumen.porMetodo.tarjeta?.total || 0,
            cantidad: resumen.porMetodo.tarjeta?.cantidad || 0,
          },
          retiros: resumen.retiros.map((r) => ({
            monto: r.monto,
            motivo: r.motivo,
            realizadoPor: r.realizadoPor,
            fecha: r.createdAt,
          })),
          totalRetiros: resumen.totalRetiros,
          totalDevoluciones: resumen.totalDevoluciones,
          efectivoDevuelto: resumen.efectivoDevuelto,
        },
      },
      { new: true }
    );

    if (!actualizada) {
      return res.status(409).json({ message: 'La caja ya fue cerrada por otra operación' });
    }

    enviarCierreDeCaja({ ventas: resumen.sales, close: actualizada, offset, turno: 'dia', totalDia: null }).catch((err) =>
      logger.error('No se pudo enviar el mail del cierre de caja', {
        motivo: err.message,
        queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
        origen: 'backend',
        lugar: 'SaleController.js → cerrarCaja',
        stack: err.stack,
      })
    );

    void enviarEvento({
      tipo: 'cierre',
      titulo: 'Cierre de caja',
      mensaje: `Día · $${Number(actualizada.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${data.nombre}`,
      url: '/sales',
      para: 'admins',
    });

    res.json({
      fecha: actualizada.fecha,
      estado: actualizada.estado,
      abiertoAt: actualizada.abiertoAt,
      abiertoPor: actualizada.abiertoPor,
      cerradoAt: actualizada.cerradoAt,
      cerradoPor: actualizada.cerradoPor,
      fondoInicial: actualizada.fondoInicial,
      ...resumenParaRespuesta(resumen),
    });
  } catch (error) {
    next(error);
  }
};

export const reabrirCaja = async (req, res, next) => {
  try {
    const data = reabrirCajaSchema.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;
    const hoy = startOfDayDate(offset);

    const abierta = await buscarCajaAbierta();
    if (abierta) {
      const fecha = new Date(abierta.fecha).toLocaleDateString('es-AR');
      return res.status(409).json({
        message: `Ya hay una caja abierta del ${fecha} por ${abierta.abiertoPor || 'otro usuario'}.`,
      });
    }

    const cerrada = await DailyClose.findOne({ fecha: hoy, turno: 'dia', estado: 'cerrado' });
    if (!cerrada) {
      return res.status(409).json({ message: 'No hay una caja cerrada de hoy para reabrir' });
    }

    const actualizada = await DailyClose.findOneAndUpdate(
      { _id: cerrada._id, estado: 'cerrado' },
      {
        $set: { estado: 'abierto', cerradoAt: null, cerradoPor: '', cerradoPorUsuario: '' },
        $push: {
          reaperturas: { por: data.nombre, usuario: req.user?.nombre || '', at: new Date() },
        },
      },
      { new: true }
    );

    if (!actualizada) {
      return res.status(409).json({ message: 'La caja ya fue reabierta por otra operación' });
    }

    void enviarEvento({
      tipo: 'cierre',
      titulo: 'Caja reabierta',
      mensaje: `${data.nombre} reabrió la caja`,
      url: '/sales',
      para: 'admins',
    });

    res.json(actualizada);
  } catch (error) {
    next(error);
  }
};

export const getDailyCloses = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, agrupar = 'turno' } = req.query;
    const filter = { estado: { $ne: 'abierto' } };

    if (desde || hasta) {
      filter.fecha = getRange(desde, hasta, offset);
    }

    const closes = await DailyClose.find(filter).sort({ fecha: -1, turno: 1 });

    if (agrupar === 'dia') {
      const grupos = new Map();
      for (const c of closes) {
        const key = c.fecha.toISOString();
        if (!grupos.has(key)) {
          grupos.set(key, {
            fecha: c.fecha,
            total: 0,
            cantidad: 0,
            totalRetiros: 0,
            totalDevoluciones: 0,
            efectivoDevuelto: 0,
            efectivo: { total: 0, cantidad: 0 },
            transferencia: { total: 0, cantidad: 0 },
            tarjeta: { total: 0, cantidad: 0 },
            cerradoAt: new Date(0),
            turnos: [],
          });
        }
        const g = grupos.get(key);
        g.total += c.total;
        g.cantidad += c.cantidad;
        g.totalRetiros += c.totalRetiros || 0;
        g.totalDevoluciones += c.totalDevoluciones || 0;
        g.efectivoDevuelto += c.efectivoDevuelto || 0;
        g.efectivo.total += c.efectivo?.total || 0;
        g.efectivo.cantidad += c.efectivo?.cantidad || 0;
        g.transferencia.total += c.transferencia?.total || 0;
        g.transferencia.cantidad += c.transferencia?.cantidad || 0;
        g.tarjeta.total += c.tarjeta?.total || 0;
        g.tarjeta.cantidad += c.tarjeta?.cantidad || 0;
        if (c.cerradoAt > g.cerradoAt) g.cerradoAt = c.cerradoAt;
        g.turnos.push(c);
      }
      return res.json([...grupos.values()]);
    }

    res.json(closes);
  } catch (error) {
    next(error);
  }
};

export const deleteDailyClose = async (req, res, next) => {
  try {
    const close = await DailyClose.findById(req.params.id);
    if (!close) {
      return res.status(404).json({ message: 'Cierre no encontrado' });
    }
    if (close.estado === 'abierto') {
      return res.status(409).json({ message: 'No se puede eliminar una caja abierta. Cerrala primero.' });
    }
    await DailyClose.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cierre eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

const getVentanaDeCierre = async (close) => {
  const fecha = close.fecha;
  const dayMs = 86400000;

  if (close.turno === 'dia') {
    return {
      desdeAt: close.abiertoAt || close.desdeAt || fecha,
      hastaAt: close.cerradoAt || close.hastaAt || new Date(fecha.getTime() + dayMs),
    };
  }

  let desdeAt = close.desdeAt;
  let hastaAt = close.hastaAt;

  if (!desdeAt) {
    if (close.turno === 'tarde') {
      const mananaClose = await DailyClose.findOne({ fecha, turno: 'manana' });
      desdeAt = (mananaClose && mananaClose.hastaAt) || fecha;
    } else {
      desdeAt = fecha;
    }
  }

  if (!hastaAt) {
    hastaAt = new Date(fecha.getTime() + dayMs);
    if (close.turno === 'manana') {
      const tardeClose = await DailyClose.findOne({ fecha, turno: 'tarde' });
      if (tardeClose?.desdeAt && tardeClose.desdeAt < hastaAt) {
        hastaAt = tardeClose.desdeAt;
      }
    }
  }

  return { desdeAt, hastaAt };
};

export const resendCloseMail = async (req, res, next) => {
  try {
    const close = await DailyClose.findById(req.params.id);
    if (!close) {
      return res.status(404).json({ message: 'Cierre no encontrado' });
    }

    const offset = Number(req.body?.offset) || Number(req.query?.offset) || 0;

    const { desdeAt, hastaAt } = await getVentanaDeCierre(close);

    const sales = await Sale.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } })
      .populate('items.producto', 'nombre categoria')
      .populate('producto', 'nombre categoria');

    let totalDia = null;
    if (close.turno === 'tarde') {
      const mananaClose = await DailyClose.findOne({ fecha: close.fecha, turno: 'manana' });
      if (mananaClose) {
        totalDia = {
          total: mananaClose.total + close.total,
          cantidad: mananaClose.cantidad + close.cantidad,
          totalRetiros: Math.round(((mananaClose.totalRetiros || 0) + (close.totalRetiros || 0)) * 100) / 100,
          totalDevoluciones: Math.round(((mananaClose.totalDevoluciones || 0) + (close.totalDevoluciones || 0)) * 100) / 100,
          efectivoDevuelto: Math.round(((mananaClose.efectivoDevuelto || 0) + (close.efectivoDevuelto || 0)) * 100) / 100,
          efectivo: {
            total: mananaClose.efectivo.total + close.efectivo.total,
            cantidad: mananaClose.efectivo.cantidad + close.efectivo.cantidad,
          },
          transferencia: {
            total: mananaClose.transferencia.total + close.transferencia.total,
            cantidad: mananaClose.transferencia.cantidad + close.transferencia.cantidad,
          },
          tarjeta: {
            total: mananaClose.tarjeta.total + close.tarjeta.total,
            cantidad: mananaClose.tarjeta.cantidad + close.tarjeta.cantidad,
          },
        };
      }
    }

    const resultado = await enviarCierreDeCaja({ ventas: sales, close, offset, turno: close.turno, totalDia });
    if (!resultado.enviado) {
      return res.status(400).json({ message: 'Mail no configurado en el servidor' });
    }
    res.json({ message: 'Mail del cierre reenviado correctamente' });
  } catch (error) {
    logger.error('No se pudo reenviar el mail del cierre', {
      motivo: error.message,
      queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
      origen: 'backend',
      lugar: 'SaleController.js → resendCloseMail',
      stack: error.stack,
    });
    next(error);
  }
};

export const mailTest = async (req, res, next) => {
  try {
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : new Date().getTimezoneOffset();
    const datos = await enviarMailTest({ offset });
    res.json({ message: 'Mail de prueba enviado', asunto: datos.subject });
  } catch (error) {
    next(error);
  }
};

export const mailStatus = async (req, res, next) => {
  try {
    const datos = await verificarMail();
    res.json({ message: 'Conexión SMTP y autenticación OK', ...datos });
  } catch (error) {
    logger.error('No se pudo verificar el estado del mail', {
      motivo: error.message,
      queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
      origen: 'backend',
      lugar: 'SaleController.js → mailStatus',
      stack: error.stack,
    });
    const err = new Error('No se pudo conectar con el servidor de mail');
    err.statusCode = 502;
    next(err);
  }
};

export const migrateSaleItems = async () => {
  const pendientes = await Sale.countDocuments({
    $or: [{ items: { $exists: false } }, { items: { $size: 0 } }],
    producto: { $exists: true, $ne: null },
  });
  if (pendientes === 0) return 0;

  const cursor = Sale.find({
    $or: [{ items: { $exists: false } }, { items: { $size: 0 } }],
    producto: { $exists: true, $ne: null },
  }).cursor();

  let count = 0;
  for await (const sale of cursor) {
    const items = getItems(sale);
    if (!items.length || !items[0].producto) continue;
    sale.items = items.map((i) => ({
      producto: i.producto,
      cantidad: i.cantidad,
      precio: i.precio,
      talle: i.talle || '',
      color: i.color || '',
      subtotal: i.subtotal ?? sale.total,
    }));
    await sale.save();
    count++;
  }
  return count;
};

export const runMigration = async (req, res, next) => {
  try {
    const count = await migrateSaleItems();
    try {
      await DailyClose.collection.dropIndex('fecha_1');
    } catch (error) {
      logger.debug('Índice fecha_1 no existía al migrar cierres', {
        origen: 'backend',
        lugar: 'SaleController.js:runMigration',
        motivo: error.message,
      });
    }
    await DailyClose.syncIndexes();
    res.json({ message: `Migradas ${count} ventas al formato items[]; índices de cierres actualizados` });
  } catch (error) {
    next(error);
  }
};

export const ensureTicketNumbers = async () => {
  const sinTicket = {
    $or: [
      { ticketNumero: { $exists: false } },
      { ticketNumero: null },
      { ticketNumero: '' },
    ],
  };
  const pendientes = await Sale.countDocuments(sinTicket);
  if (pendientes === 0) return 0;

  const cursor = Sale.find(sinTicket).cursor();
  let count = 0;

  for await (const sale of cursor) {
    sale.ticketNumero = await generarTicketNumero();
    await sale.save();
    count++;
  }

  return count;
};

export const migrateTickets = async (req, res, next) => {
  try {
    const count = await ensureTicketNumbers();
    res.json({ message: `Asignados números de ticket a ${count} ventas` });
  } catch (error) {
    next(error);
  }
};

export const getSalesStats = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0 } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const sales = await Sale.find(filter);

    const total = Math.round(sales.reduce((sum, s) => sum + getTotalNeto(s), 0) * 100) / 100;
    const cantidad = sales.reduce((sum, s) => sum + getUnidadesNetas(s), 0);

    const porMetodo = sales.reduce((acc, s) => {
      const unidadesNetas = getUnidadesNetas(s);
      if (unidadesNetas <= 0) return acc;
      if (s.pagos && s.pagos.length > 0) {
        const totalPagado = s.pagos.reduce((sum, p) => sum + p.monto, 0);
        if (totalPagado <= 0) return acc;
        let asignadas = 0;
        for (let i = 0; i < s.pagos.length; i++) {
          const p = s.pagos[i];
          if (!acc[p.metodo]) acc[p.metodo] = { total: 0, cantidad: 0 };
          acc[p.metodo].total += p.monto;
          const parte = i === s.pagos.length - 1
            ? unidadesNetas - asignadas
            : Math.round(unidadesNetas * (p.monto / totalPagado));
          acc[p.metodo].cantidad += parte;
          asignadas += parte;
        }
      } else {
        const m = s.metodoPago || 'efectivo';
        if (!acc[m]) acc[m] = { total: 0, cantidad: 0 };
        acc[m].total += s.total;
        acc[m].cantidad += unidadesNetas;
      }
      return acc;
    }, {});

    res.json({
      total,
      cantidad,
      efectivo: porMetodo.efectivo || { total: 0, cantidad: 0 },
      transferencia: porMetodo.transferencia || { total: 0, cantidad: 0 },
      tarjeta: porMetodo.tarjeta || { total: 0, cantidad: 0 },
    });
  } catch (error) {
    next(error);
  }
};