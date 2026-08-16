import mongoose from 'mongoose';
import net from 'node:net';
import Sale from './SaleModel.js';
import Product from '../Product/ProductModel.js';
import Return from '../Return/ReturnModel.js';
import DailyClose from './DailyCloseModel.js';
import { createSaleSchema } from './SaleSchema.js';
import { generarTicketNumero, guardarConTicketUnico } from './ticketUtils.js';
import { enviarCierreDeCaja, enviarMailTest, verificarMail } from '../../services/emailService.js';

const parseDate = (str, offset = 0) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const utcDate = Date.UTC(y, m - 1, d);
  return new Date(utcDate + offset * 60000);
};

const getRange = (start, end, offset = 0) => {
  const from = parseDate(start, Number(offset)) || new Date(0);
  const to = parseDate(end, Number(offset));
  return {
    $gte: from,
    $lt: to ? new Date(to.getTime() + 86400000) : new Date(8640000000000000),
  };
};

const clientTodayDate = (offset = 0) => {
  const local = new Date(Date.now() - Number(offset) * 60000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
};

const startOfDayDate = (offset = 0) => {
  const { y, m, d } = clientTodayDate(offset);
  return new Date(Date.UTC(y, m - 1, d) + Number(offset) * 60000);
};

const getItems = (sale) => {
  return (sale.items && sale.items.length > 0)
    ? sale.items
    : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio, talle: sale.talle, color: '', subtotal: sale.total }];
};

const findVariantIdx = (product, talle, color) => {
  return product.variants.findIndex((v) => v.talle === (talle || '') && v.color === (color || ''));
};

export const createSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const data = createSaleSchema.parse(req.body);

    const items = [];
    for (const item of data.items) {
      const product = await Product.findById(item.producto).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.producto} no encontrado` });
      }

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
            message: `Stock insuficiente para "${product.nombre}". Solo hay ${product.variants[idx].cantidad} unidad(es).`,
          });
        }
        product.variants[idx].cantidad -= item.cantidad;
      } else {
        if (product.cantidad < item.cantidad) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Stock insuficiente para "${product.nombre}". Solo hay ${product.cantidad} unidad(es).`,
          });
        }
        product.cantidad -= item.cantidad;
      }

      await product.save({ session });

      items.push({
        producto: item.producto,
        cantidad: item.cantidad,
        precio: item.precio,
        talle: item.talle || '',
        color: item.color || '',
        subtotal: item.precio * item.cantidad,
      });
    }

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const total = subtotal * (1 - (data.descuento || 0) / 100);

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
      empleado: data.empleado,
      pagos: data.pagos,
      descuento: data.descuento || 0,
    }], { session });

    const savedSale = await guardarConTicketUnico(sale[0], session);

    await session.commitTransaction();

    const populated = await savedSale.populate('items.producto', 'nombre');

    res.status(201).json(populated);
  } catch (error) {
    await session.abortTransaction();
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

    const items = getItems(sale);

    const returnCount = await Return.countDocuments({ producto: { $in: items.map(i => i.producto) } }).session(session);
    if (returnCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede eliminar la venta porque tiene devoluciones asociadas' });
    }

    for (const item of items) {
      const product = await Product.findById(item.producto).session(session);
      if (product) {
        if (product.variants?.length > 0) {
          const idx = findVariantIdx(product, item.talle, item.color);
          if (idx !== -1) {
            product.variants[idx].cantidad += item.cantidad;
          }
        }
        product.cantidad += item.cantidad;
        await product.save({ session });
      }
    }

    await Sale.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const getSales = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, numero } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.createdAt = getRange(desde, hasta, offset);
    }

    const numeroStr = String(numero || '').trim().replace(/[^0-9]/g, '');
    if (numeroStr) {
      filter.ticketNumero = { $regex: numeroStr, $options: 'i' };
    }

    const sales = await Sale.find(filter)
      .populate('items.producto', 'nombre categoria')
      .populate('producto', 'nombre categoria')
      .sort({ createdAt: -1 });

    const total = sales.reduce((sum, s) => sum + s.total, 0);

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
      const items = getItems(sale);
      const totalUnidades = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0) || 1;
      const factor = Math.max(0, 1 - ((sale.cantidadDevuelta || 0) / totalUnidades));
      for (const item of items) {
        const pid = item.producto?.toString() || item.producto;
        if (!productMap[pid]) productMap[pid] = { totalVendido: 0, ingresos: 0 };
        const cantEfectiva = item.cantidad * factor;
        productMap[pid].totalVendido += cantEfectiva;
        const itemSubtotal = item.subtotal || (item.cantidad * (item.precio || 0));
        const ratio = sale.total > 0 ? itemSubtotal / sale.total : 1 / items.length;
        productMap[pid].ingresos += sale.total * ratio * factor;
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
    const offset = Number(req.query.offset) || 0;
    const turno = req.query.turno === 'tarde' ? 'tarde' : 'manana';
    const cerradoPor = String(req.query.cerradoPor || '').trim();
    if (!cerradoPor) {
      return res.status(400).json({ message: 'Debe indicar quién cierra el turno' });
    }

    const now = new Date();
    const hoyInicio = startOfDayDate(offset);

    let esHoy;
    let fechaDate;
    if (!req.query.fecha) {
      esHoy = true;
      fechaDate = hoyInicio;
    } else {
      fechaDate = parseDate(req.query.fecha, Number(offset));
      if (!fechaDate) {
        return res.status(400).json({ message: 'Fecha inválida' });
      }
      if (fechaDate.getTime() > hoyInicio.getTime()) {
        return res.status(400).json({ message: 'No se puede cerrar una fecha futura' });
      }
      esHoy = fechaDate.getTime() === hoyInicio.getTime();
    }

    const existing = await DailyClose.findOne({ fecha: fechaDate, turno });
    if (!esHoy && existing) {
      return res.status(400).json({ message: 'Ese turno de esa fecha ya fue cerrado' });
    }
    if (!esHoy && !existing) {
      const legacyClose = await DailyClose.findOne({ fecha: fechaDate, turno: { $exists: false } });
      if (legacyClose) {
        return res.status(400).json({ message: 'Ese turno de esa fecha ya fue cerrado' });
      }
    }

    let desdeAt;
    if (existing?.hastaAt) {
      desdeAt = existing.hastaAt;
    } else if (existing) {
      desdeAt = existing.desdeAt || fechaDate;
    } else if (turno === 'manana') {
      desdeAt = fechaDate;
    } else {
      const mananaClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'manana' });
      desdeAt = (mananaClose && mananaClose.hastaAt) || fechaDate;
    }

    let hastaAt = esHoy ? now : new Date(fechaDate.getTime() + 86400000);

    if (!esHoy && turno === 'manana') {
      const tardeClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'tarde' });
      if (tardeClose?.desdeAt && tardeClose.desdeAt < hastaAt) {
        hastaAt = tardeClose.desdeAt;
      }
    }

    const sales = await Sale.find({ createdAt: { $gte: desdeAt, $lt: hastaAt } })
      .populate('items.producto', 'nombre categoria')
      .populate('producto', 'nombre categoria');

    const total = sales.reduce((sum, s) => sum + s.total, 0);
    const cantidad = sales.reduce((sum, s) => {
      const items = getItems(s);
      return sum + items.reduce((acc, i) => acc + i.cantidad, 0) - (s.cantidadDevuelta || 0);
    }, 0);

    const porMetodo = sales.reduce((acc, s) => {
      if (s.pagos && s.pagos.length > 0) {
        const vistos = new Set();
        for (const p of s.pagos) {
          if (!acc[p.metodo]) acc[p.metodo] = { total: 0, cantidad: 0 };
          acc[p.metodo].total += p.monto;
          vistos.add(p.metodo);
        }
        const items = getItems(s);
        const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);
        for (const m of vistos) {
          acc[m].cantidad += totalUnidades;
        }
      } else {
        const m = s.metodoPago || 'efectivo';
        if (!acc[m]) acc[m] = { total: 0, cantidad: 0 };
        acc[m].total += s.total;
        const items = getItems(s);
        acc[m].cantidad += items.reduce((a, i) => a + i.cantidad, 0);
      }
      return acc;
    }, {});

    const buildClose = () =>
      DailyClose.findOneAndUpdate(
        { fecha: fechaDate, turno },
        {
          fecha: fechaDate,
          turno,
          desdeAt,
          hastaAt,
          cerradoPor,
          total,
          cantidad,
          efectivo: porMetodo.efectivo || { total: 0, cantidad: 0 },
          transferencia: porMetodo.transferencia || { total: 0, cantidad: 0 },
          tarjeta: porMetodo.tarjeta || { total: 0, cantidad: 0 },
          cerradoAt: new Date(),
        },
        { upsert: true, new: true }
      );

    let close;
    try {
      close = await buildClose();
    } catch (error) {
      if (error.code === 11000) {
        close = await DailyClose.findOne({ fecha: fechaDate, turno });
        if (!close) throw error;
      } else {
        throw error;
      }
    }

    let totalDia = null;
    if (turno === 'tarde') {
      const mananaClose = await DailyClose.findOne({ fecha: fechaDate, turno: 'manana' });
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

    enviarCierreDeCaja({ ventas: sales, close, offset, turno, totalDia }).catch((err) =>
      console.error('[Mail] Error al enviar el cierre de caja:', err.message)
    );

    res.json({
      fecha: close.fecha,
      turno: close.turno,
      cerradoPor: close.cerradoPor,
      total: close.total,
      cantidad: close.cantidad,
      efectivo: close.efectivo,
      transferencia: close.transferencia,
      tarjeta: close.tarjeta,
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
      return res.status(500).json({ message: 'Mail no configurado en el servidor' });
    }
    res.json({ message: 'Mail del cierre reenviado correctamente' });
  } catch (error) {
    const detalle = error.message || error.code || 'Error desconocido';
    console.error('[Mail] Error al reenviar mail del cierre:', detalle);
    return res.status(500).json({ message: `No se pudo enviar el mail: ${detalle}` });
  }
};

export const mailTest = async (req, res, next) => {
  try {
    const offset = Number(req.query.offset) || new Date().getTimezoneOffset();
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
    const detalle = error.message || error.code || 'Error desconocido';
    console.error('[Mail] mail-status:', detalle);
    res.status(500).json({
      message: `Fallo al conectar con el SMTP: ${detalle}`,
      host: process.env.MAIL_HOST || 'smtp-relay.brevo.com',
      port: Number(process.env.MAIL_PORT || 587),
      user: process.env.MAIL_USER ? `*${process.env.MAIL_USER.slice(-4)}` : '(vacío)',
      to: process.env.MAIL_TO || '(vacío)',
    });
  }
};

export const netProbe = async (req, res, next) => {
  const host = String(req.query.host || '').trim();
  const port = Number(req.query.port);

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ message: 'Parámetros inválidos: host y port (1-65535) son requeridos' });
  }
  if (host.includes('://') || /[\s/]/.test(host)) {
    return res.status(400).json({ message: 'host inválido' });
  }

  const TIMEOUT = 5000;
  const t0 = Date.now();
  const socket = net.connect({ host, port, timeout: TIMEOUT, family: 4 });

  const resultado = await new Promise((resolve) => {
    const done = (reachable, error) => {
      socket.destroy();
      resolve({ host, port, reachable, error: error || null, ms: Date.now() - t0 });
    };
    socket.once('connect', () => done(true, null));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (err) => done(false, err.code || err.message));
  });

  res.json(resultado);
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
    } catch {}
    await DailyClose.syncIndexes();
    res.json({ message: `Migradas ${count} ventas al formato items[]; índices de cierres actualizados` });
  } catch (error) {
    next(error);
  }
};

export const ensureTicketNumbers = async () => {
  const cursor = Sale.find({ ticketNumero: { $exists: false } }).cursor();
  let count = 0;

  for await (const sale of cursor) {
    sale.ticketNumero = generarTicketNumero();
    let guardado = false;
    for (let i = 0; i < 10 && !guardado; i++) {
      try {
        await sale.save();
        guardado = true;
      } catch (error) {
        if (error.code !== 11000) throw error;
        sale.ticketNumero = generarTicketNumero();
      }
    }
    if (!guardado) throw new Error('No se pudo asignar un número de ticket único');
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

    const total = sales.reduce((sum, s) => sum + s.total, 0);
    const cantidad = sales.reduce((sum, s) => {
      const items = getItems(s);
      return sum + items.reduce((acc, i) => acc + i.cantidad, 0) - (s.cantidadDevuelta || 0);
    }, 0);

    const porMetodo = sales.reduce((acc, s) => {
      if (s.pagos && s.pagos.length > 0) {
        const vistos = new Set();
        for (const p of s.pagos) {
          if (!acc[p.metodo]) acc[p.metodo] = { total: 0, cantidad: 0 };
          acc[p.metodo].total += p.monto;
          vistos.add(p.metodo);
        }
        const items = getItems(s);
        const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);
        for (const m of vistos) {
          acc[m].cantidad += totalUnidades;
        }
      } else {
        const m = s.metodoPago || 'efectivo';
        if (!acc[m]) acc[m] = { total: 0, cantidad: 0 };
        acc[m].total += s.total;
        const items = getItems(s);
        acc[m].cantidad += items.reduce((a, i) => a + i.cantidad, 0);
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