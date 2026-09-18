import mongoose from 'mongoose';
import Sale from './SaleModel.js';
import Product from '../Product/ProductModel.js';
import Return from '../Return/ReturnModel.js';
import DailyClose from './DailyCloseModel.js';
import CashWithdrawal from '../CashWithdrawal/CashWithdrawalModel.js';
import { createSaleSchema } from './SaleSchema.js';
import { generarTicketNumero, guardarConTicketUnico } from './ticketUtils.js';
import { enviarCierreDeCaja, enviarMailTest, verificarMail } from '../../services/emailService.js';
import { enviarEvento, enviarStockBajo } from '../../services/pushService.js';
import { parseDate, getRange, startOfDayDate } from '../../utils/fechas.js';
import { findVariantIdx, extraDeposito } from '../../utils/variantes.js';
import logger from '../../utils/logger.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getItems = (sale) => {
  return (sale.items && sale.items.length > 0)
    ? sale.items
    : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio, talle: sale.talle, color: '', subtotal: sale.total }];
};

const getUnidadesNetas = (sale) => {
  if (sale.estado === 'devuelta') return 0;
  const items = getItems(sale);
  const total = items.reduce((acc, i) => acc + (Number(i.cantidad) || 0), 0);
  if (sale.items && sale.items.length > 0) return total;
  return Math.max(0, total - (sale.cantidadDevuelta || 0));
};

export const createSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const data = createSaleSchema.parse(req.body);

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

    await session.commitTransaction();

    savedSale.$session(null);
    const populated = await savedSale.populate('items.producto', 'nombre codigo');

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
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const deleteSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
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
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const getSales = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, numero, codigo, buscar } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const numeroStr = String(numero || '').trim().replace(/[^0-9]/g, '');
    if (numeroStr) {
      filter.ticketNumero = { $regex: `^${numeroStr}` };
    }

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
      filter.$or = [{ 'items.producto': product._id }, { producto: product._id }];
    }

    const buscarStr = String(buscar || '').trim();
    if (buscarStr) {
      const safe = escapeRegex(buscarStr);
      const or = [{ ticketNumero: { $regex: `^(T-)?${safe}`, $options: 'i' } }];
      const product = await Product.findOne({
        codigo: { $regex: `^${safe}$`, $options: 'i' },
      })
        .select('_id')
        .lean();
      if (product) {
        or.push({ 'items.producto': product._id }, { producto: product._id });
      }
      filter.$or = or;
    }

    const sales = await Sale.find(filter)
      .populate('items.producto', 'nombre categoria codigo')
      .populate('producto', 'nombre categoria codigo')
      .sort({ createdAt: -1 });

    const total = Math.round(sales.reduce((sum, s) => sum + s.total, 0) * 100) / 100;

    res.json({ sales, total });
  } catch (error) {
    next(error);
  }
};

export const getMostSold = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, limit = 5 } = req.query;
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
      .slice(0, Number(limit));

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

export const getDailyClose = async (req, res, next) => {
  try {
    const p = (key) => req.body?.[key] ?? req.query?.[key];
    const offset = Number.isFinite(Number(p('offset'))) ? Number(p('offset')) : 0;
    const turno = p('turno') || 'manana';
    if (turno !== 'manana' && turno !== 'tarde') {
      return res.status(400).json({ message: 'Turno inválido. Use "manana" o "tarde"' });
    }
    const cerradoPor = req.user.nombre;

    const now = new Date();
    const hoyInicio = startOfDayDate(offset);

    let esHoy;
    let fechaDate;
    if (!p('fecha')) {
      esHoy = true;
      fechaDate = hoyInicio;
    } else {
      fechaDate = parseDate(p('fecha'), Number(offset));
      if (!fechaDate) {
        return res.status(400).json({ message: 'Fecha inválida' });
      }
      if (fechaDate.getTime() > hoyInicio.getTime()) {
        return res.status(400).json({ message: 'No se puede cerrar una fecha futura' });
      }
      esHoy = fechaDate.getTime() === hoyInicio.getTime();
    }

    const existing = await DailyClose.findOne({ fecha: fechaDate, turno });
    if (existing) {
      return res.status(400).json({ message: `Ese turno (${turno === 'tarde' ? 'tarde' : 'mañana'}) ya fue cerrado` });
    }
    if (!esHoy && !existing) {
      const legacyClose = await DailyClose.findOne({ fecha: fechaDate, turno: { $exists: false } });
      if (legacyClose) {
        return res.status(400).json({ message: 'Ese turno de esa fecha ya fue cerrado' });
      }
    }
    if (turno === 'tarde') {
      const mananaClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'manana' });
      const legacyClose = await DailyClose.findOne({ fecha: fechaDate, turno: { $exists: false } });
      if (!mananaClose && !legacyClose) {
        return res.status(400).json({ message: 'Debe cerrar primero el turno mañana de esa fecha' });
      }
    }

    let desdeAt;
    if (turno === 'manana') {
      desdeAt = fechaDate;
    } else {
      const mananaClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'manana' });
      desdeAt = (mananaClose && mananaClose.hastaAt) || fechaDate;
    }

    let hastaAt = esHoy ? now : new Date(fechaDate.getTime() + 86400000);

    if (turno === 'manana') {
      const tardeClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'tarde' });
      if (tardeClose?.desdeAt && tardeClose.desdeAt < hastaAt) {
        hastaAt = tardeClose.desdeAt;
      }
    }

    const sales = await Sale.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } })
      .populate('items.producto', 'nombre categoria')
      .populate('producto', 'nombre categoria');

    const retiros = await CashWithdrawal.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } }).sort({ createdAt: 1 });
    const totalRetiros = Math.round(retiros.reduce((sum, r) => sum + r.monto, 0) * 100) / 100;

    const total = Math.round(sales.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
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

    const closeData = {
      fecha: fechaDate,
      turno,
      desdeAt,
      hastaAt,
      cerradoPor,
      total,
      cantidad,
      efectivo: { total: porMetodo.efectivo?.total || 0, cantidad: porMetodo.efectivo?.cantidad || 0 },
      transferencia: { total: porMetodo.transferencia?.total || 0, cantidad: porMetodo.transferencia?.cantidad || 0 },
      tarjeta: { total: porMetodo.tarjeta?.total || 0, cantidad: porMetodo.tarjeta?.cantidad || 0 },
      retiros: retiros.map((r) => ({
        monto: r.monto,
        motivo: r.motivo,
        realizadoPor: r.realizadoPor,
        fecha: r.createdAt,
      })),
      totalRetiros,
      cerradoAt: new Date(),
    };

    let close;
    try {
      close = await DailyClose.create(closeData);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Ese turno ya fue cerrado por otra operación simultánea' });
      }
      throw error;
    }

    let totalDia = null;
    if (turno === 'tarde') {
      const mananaClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'manana' });
      if (mananaClose) {
        totalDia = {
          total: mananaClose.total + close.total,
          cantidad: mananaClose.cantidad + close.cantidad,
          totalRetiros: Math.round(((mananaClose.totalRetiros || 0) + (close.totalRetiros || 0)) * 100) / 100,
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

    enviarCierreDeCaja({ ventas: sales, close, offset, turno, totalDia }).catch((err) =>
      logger.error('No se pudo enviar el mail del cierre de caja', {
        motivo: err.message,
        queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
        origen: 'backend',
        lugar: 'SaleController.js → getDailyClose',
        stack: err.stack,
      })
    );

    void enviarEvento({
      tipo: 'cierre',
      titulo: 'Cierre de caja',
      mensaje: `Turno ${turno === 'tarde' ? 'Tarde' : 'Mañana'} · $${Number(close.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${cerradoPor}`,
      url: '/sales',
      para: 'admins',
    });

    res.json({
      fecha: close.fecha,
      turno: close.turno,
      cerradoPor: close.cerradoPor,
      total: close.total,
      cantidad: close.cantidad,
      efectivo: close.efectivo,
      transferencia: close.transferencia,
      tarjeta: close.tarjeta,
      retiros: close.retiros || [],
      totalRetiros: close.totalRetiros || 0,
      efectivoEsperado: Math.max(0, Math.round(((close.efectivo?.total || 0) - (close.totalRetiros || 0)) * 100) / 100),
      cerradoAt: close.cerradoAt,
    });
  } catch (error) {
    next(error);
  }
};

export const getDailyCloses = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, agrupar = 'turno' } = req.query;
    const filter = {};

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
    const close = await DailyClose.findByIdAndDelete(req.params.id);
    if (!close) {
      return res.status(404).json({ message: 'Cierre no encontrado' });
    }
    res.json({ message: 'Cierre eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

const getVentanaDeCierre = async (close) => {
  const fecha = close.fecha;
  const dayMs = 86400000;

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

export const runMigration = async (req, res, next) => {
  try {
    const cursor = Sale.find({ items: { $exists: false } }).cursor();
    let count = 0;
    for await (const sale of cursor) {
      sale.items = [{
        producto: sale.producto,
        cantidad: sale.cantidad,
        precio: sale.precio,
        talle: sale.talle || '',
        subtotal: sale.total,
      }];
      await sale.save();
      count++;
    }
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

    const total = Math.round(sales.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
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