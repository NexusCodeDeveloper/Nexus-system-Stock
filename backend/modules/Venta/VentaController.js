import mongoose from 'mongoose';
import Venta from './VentaModel.js';
import Producto from '../Producto/ProductoModel.js';
import Devolucion from '../Devolucion/DevolucionModel.js';
import CierreCaja from './CierreCajaModel.js';
import RetiroCaja from '../RetiroCaja/RetiroCajaModel.js';
import { schemaCrearVenta, schemaAbrirCaja, schemaCerrarCaja, schemaReabrirCaja } from './VentaSchema.js';
import { generarTicketNumero, guardarConTicketUnico } from './TicketUtils.js';
import { enviarCierreDeCaja, enviarCorreoPrueba, verificarCorreo } from '../../services/CorreoService.js';
import { enviarEvento, enviarStockBajo } from '../../services/PushService.js';
import { parsearFecha, obtenerRango, inicioDeDia } from '../../utils/FechasUtils.js';
import { indiceDeVariante, extraDeposito } from '../../utils/VariantesUtils.js';
import { obtenerArticulos, unidadesNetasVenta, totalNetoVenta } from '../../utils/VentasUtils.js';
import { encontrarCierreDeFecha, mensajeCierre } from '../../utils/CierresUtils.js';
import { buscarCajaAbierta, respuestaSinCaja, MENSAJE_SIN_CAJA, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/CajaUtils.js';
import logger from '../../utils/LoggerUtils.js';

const escaparRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const crearVenta = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = schemaCrearVenta.parse(req.body);

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de vender tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, Number(data.offset) || 0)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const articulos = [];
    const productosVendidos = [];
    const idsProductos = data.articulos.map((item) => item.producto);
    const productos = await Producto.find({ _id: { $in: idsProductos } }).session(session);
    const productosPorId = new Map(productos.map((p) => [p._id.toString(), p]));

    for (const item of data.articulos) {
      const product = productosPorId.get(String(item.producto));
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.producto} no encontrado` });
      }
      productosVendidos.push(product);

      if (product.variantes?.length > 0) {
        const idx = indiceDeVariante(product, item.talle, item.color);
        if (idx === -1) {
          const label = [item.talle, item.color].filter(Boolean).join(' / ') || 'sin variante';
          await session.abortTransaction();
          return res.status(400).json({ message: `Variante "${label}" no encontrada en "${product.nombre}"` });
        }
        if (product.variantes[idx].cantidad < item.cantidad) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `Stock insuficiente para "${product.nombre}". Solo hay ${product.variantes[idx].cantidad} unidad(es) en salón.${extraDeposito(product, item.talle, item.color)}`,
          });
        }
        product.variantes[idx].cantidad -= item.cantidad;
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
      articulos.push({
        producto: item.producto,
        cantidad: item.cantidad,
        precio: precioUnitario,
        talle: item.talle || '',
        color: item.color || '',
        subtotal: Math.round(precioUnitario * item.cantidad * 100) / 100,
      });
    }

    const subtotal = articulos.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - (data.descuento || 0) / 100) * 100) / 100;

    const sumaPagos = (data.pagos || []).reduce((s, p) => s + p.monto, 0);
    if (Math.abs(sumaPagos - total) > 0.01) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `La suma de los montos de pago ($${sumaPagos.toFixed(2)}) no coincide con el total ($${total.toFixed(2)})`,
      });
    }

    const venta = await Venta.create([{
      articulos,
      total,
      empleado: req.usuario.nombre,
      pagos: data.pagos,
      descuento: data.descuento || 0,
    }], { session });

    const savedSale = await guardarConTicketUnico(venta[0], session);

    const populated = await Venta.findById(savedSale._id)
      .session(session)
      .populate('articulos.producto', 'nombre codigo');

    await session.commitTransaction();

    void enviarStockBajo(productosVendidos);
    void enviarEvento({
      tipo: 'venta',
      titulo: 'Nueva venta',
      mensaje: `$${Number(total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} · ${req.usuario.nombre}`,
      url: '/sales',
      para: { usuarioId: req.usuario.id, nombre: req.usuario.nombre },
    });

    res.status(201).json(populated);
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const eliminarVenta = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const venta = await Venta.findById(req.params.id).session(session);
    if (!venta) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Venta no encontrada' });
    }
    if (venta.estado === 'devuelta') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede eliminar una venta ya devuelta' });
    }

    const cierre = await encontrarCierreDeFecha(venta.fechaCreacion);
    if (cierre) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `No se puede eliminar una venta que ya forma parte de un cierre.${mensajeCierre(cierre)}`,
      });
    }

    const articulos = obtenerArticulos(venta);

    const returnCount = await Devolucion.countDocuments({
      $or: [{ venta: venta._id }, { ventaDiferenciaId: venta._id }],
    }).session(session);
    if (returnCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede eliminar la venta porque tiene devoluciones o cambios asociados' });
    }

    const idsProductos = articulos.map((item) => item.producto).filter(Boolean);
    const productos = await Producto.find({ _id: { $in: idsProductos } }).session(session);
    const productosPorId = new Map(productos.map((p) => [p._id.toString(), p]));
    const modificados = new Map();

    for (const item of articulos) {
      const product = item.producto ? productosPorId.get(String(item.producto)) : null;
      if (!product) continue;
      if (product.variantes?.length > 0) {
        const idx = indiceDeVariante(product, item.talle, item.color);
        if (idx === -1) {
          product.variantes.push({ talle: item.talle || '', color: item.color || '', cantidad: item.cantidad });
        } else {
          product.variantes[idx].cantidad += item.cantidad;
        }
      } else {
        product.cantidad += item.cantidad;
      }
      modificados.set(product._id.toString(), product);
    }

    for (const product of modificados.values()) {
      await product.save({ session });
    }

    await Venta.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const obtenerVentas = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, numero, codigo, buscar } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.fechaCreacion = obtenerRango(desde, hasta, offset);
    }

    const numeroStr = String(numero || '').trim();
    if (numeroStr) {
      filter.ticketNumero = { $regex: escaparRegex(numeroStr), $options: 'i' };
    }

    const or = [];
    const codigoStr = String(codigo || '').trim();
    if (codigoStr) {
      const product = await Producto.findOne({
        codigo: { $regex: `^${escaparRegex(codigoStr)}$`, $options: 'i' },
      })
        .select('_id')
        .lean();
      if (!product) {
        return res.json({ ventas: [], total: 0 });
      }
      or.push({ 'articulos.producto': product._id }, { producto: product._id });
    }

    const buscarStr = String(buscar || '').trim();
    if (buscarStr) {
      const safe = escaparRegex(buscarStr);
      or.push({ ticketNumero: { $regex: `^(T-)?${safe}`, $options: 'i' } });
      const product = await Producto.findOne({
        codigo: { $regex: `^${safe}$`, $options: 'i' },
      })
        .select('_id')
        .lean();
      if (product) {
        or.push({ 'articulos.producto': product._id }, { producto: product._id });
      }
    }
    if (or.length > 0) {
      filter.$or = or;
    }

    const ventas = await Venta.find(filter)
      .populate('articulos.producto', 'nombre categoria codigo')
      .populate('producto', 'nombre categoria codigo')
      .sort({ fechaCreacion: -1 });

    const total = Math.round(ventas.reduce((sum, s) => sum + totalNetoVenta(s), 0) * 100) / 100;

    res.json({ ventas, total });
  } catch (error) {
    next(error);
  }
};

export const obtenerMasVendidos = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, limit = 5 } = req.query;
    const limite = Math.min(Math.max(Number(limit) || 5, 1), 50);
    const filter = {};

    if (desde || hasta) {
      filter.fechaCreacion = obtenerRango(desde, hasta, offset);
    }

    const sales = await Venta.find(filter);

    const productMap = {};
    for (const venta of sales) {
      if (venta.estado === 'devuelta') continue;
      const esLegacy = !(venta.articulos && venta.articulos.length > 0);
      const devueltoLegacy = esLegacy ? (venta.cantidadDevuelta || 0) : 0;
      const articulos = obtenerArticulos(venta);
      for (const item of articulos) {
        if (!item.producto) continue;
        const pid = String(item.producto);
        if (!productMap[pid]) productMap[pid] = { totalVendido: 0, ingresos: 0 };
        const cantEfectiva = Math.max(0, (item.cantidad || 0) - devueltoLegacy);
        if (cantEfectiva === 0) continue;
        productMap[pid].totalVendido += cantEfectiva;
        const itemSubtotal = item.subtotal || (item.cantidad * (item.precio || 0));
        const ratio = venta.total > 0 ? itemSubtotal / venta.total : 1 / articulos.length;
        productMap[pid].ingresos += venta.total * ratio * (cantEfectiva / (item.cantidad || 1));
      }
    }

    const sorted = Object.entries(productMap)
      .map(([productoId, data]) => ({ productoId, ...data }))
      .sort((a, b) => b.totalVendido - a.totalVendido)
      .slice(0, limite);

    const products = await Producto.find({ _id: { $in: sorted.map(r => r.productoId) } });
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
  const desde = caja.abiertaEn || caja.fecha;
  const hasta = caja.cerradaEn || new Date();

  const sales = await Venta.find({ fechaCreacion: { $gte: desde, $lt: hasta } })
    .populate('articulos.producto', 'nombre categoria')
    .populate('producto', 'nombre categoria');

  const retiros = await RetiroCaja.find({ fechaCreacion: { $gte: desde, $lt: hasta } }).sort({ fechaCreacion: 1 });
  const totalRetiros = Math.round(retiros.reduce((sum, r) => sum + r.monto, 0) * 100) / 100;

  const devoluciones = await Devolucion.find({ fechaCreacion: { $gte: desde, $lt: hasta } });
  const totalDevoluciones = Math.round(devoluciones.reduce((sum, r) => sum + (r.montoDevuelto || 0), 0) * 100) / 100;
  const efectivoDevuelto = Math.round(devoluciones.reduce((sum, r) => sum + (r.efectivoDevuelto || 0), 0) * 100) / 100;

  const total = Math.round(sales.reduce((sum, s) => sum + totalNetoVenta(s), 0) * 100) / 100;
  const cantidad = sales.reduce((sum, s) => sum + unidadesNetasVenta(s), 0);

  const porMetodo = sales.reduce((acc, s) => {
    const unidadesNetas = unidadesNetasVenta(s);
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
    desde,
    hasta,
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
  desde: resumen.desde,
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
    const data = schemaAbrirCaja.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;
    const fechaDate = inicioDeDia(offset);

    const abierta = await buscarCajaAbierta();
    if (abierta) {
      const fecha = new Date(abierta.fecha).toLocaleDateString('es-AR');
      return res.status(409).json({
        message: `Ya hay una caja abierta del ${fecha} por ${abierta.abiertoPor || 'otro usuario'}. Cerrala antes de abrir una nueva.`,
      });
    }

    const yaCerrada = await CierreCaja.findOne({ fecha: fechaDate, turno: 'dia', estado: { $ne: 'abierto' } });
    if (yaCerrada) {
      return res.status(409).json({ message: 'La caja de hoy ya fue cerrada.' });
    }

    let caja;
    try {
      caja = await CierreCaja.create({
        fecha: fechaDate,
        turno: 'dia',
        estado: 'abierto',
        abiertaEn: new Date(),
        abiertoPor: data.nombre,
        abiertoPorUsuario: req.usuario?.nombre || '',
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

export const obtenerCajaAbierta = async (req, res, next) => {
  try {
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
    const hoy = inicioDeDia(offset);
    const cierreHoy = await CierreCaja.findOne({ fecha: hoy, turno: 'dia', estado: 'cerrado' })
      .select('_id fecha cerradaEn cerradoPor total cantidad reaperturas');

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
    const data = schemaCerrarCaja.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;

    const caja = await buscarCajaAbierta();
    if (!caja) {
      return res.status(409).json({ message: 'No hay una caja abierta para cerrar' });
    }

    const resumen = await calcularResumenCaja(caja);
    const cerradaEn = new Date();

    const actualizada = await CierreCaja.findOneAndUpdate(
      { _id: caja._id, estado: 'abierto' },
      {
        $set: {
          estado: 'cerrado',
          cerradaEn,
          cerradoPor: data.nombre,
          cerradoPorUsuario: req.usuario?.nombre || '',
          desde: resumen.desde,
          hasta: cerradaEn,
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
            fecha: r.fechaCreacion,
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
        lugar: 'VentaController.js → cerrarCaja',
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
      abiertaEn: actualizada.abiertaEn,
      abiertoPor: actualizada.abiertoPor,
      cerradaEn: actualizada.cerradaEn,
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
    const data = schemaReabrirCaja.parse(req.body);
    const offset = Number.isFinite(Number(data.offset)) ? Number(data.offset) : 0;
    const hoy = inicioDeDia(offset);

    const abierta = await buscarCajaAbierta();
    if (abierta) {
      const fecha = new Date(abierta.fecha).toLocaleDateString('es-AR');
      return res.status(409).json({
        message: `Ya hay una caja abierta del ${fecha} por ${abierta.abiertoPor || 'otro usuario'}.`,
      });
    }

    const cerrada = await CierreCaja.findOne({ fecha: hoy, turno: 'dia', estado: 'cerrado' });
    if (!cerrada) {
      return res.status(409).json({ message: 'No hay una caja cerrada de hoy para reabrir' });
    }

    const actualizada = await CierreCaja.findOneAndUpdate(
      { _id: cerrada._id, estado: 'cerrado' },
      {
        $set: { estado: 'abierto', cerradaEn: null, cerradoPor: '', cerradoPorUsuario: '' },
        $push: {
          reaperturas: { por: data.nombre, usuario: req.usuario?.nombre || '', at: new Date() },
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

export const obtenerCierresCaja = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0, agrupar = 'turno' } = req.query;
    const filter = { estado: { $ne: 'abierto' } };

    if (desde || hasta) {
      filter.fecha = obtenerRango(desde, hasta, offset);
    }

    const closes = await CierreCaja.find(filter).sort({ fecha: -1, turno: 1 });

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
            cerradaEn: new Date(0),
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
        if (c.cerradaEn > g.cerradaEn) g.cerradaEn = c.cerradaEn;
        g.turnos.push(c);
      }
      return res.json([...grupos.values()]);
    }

    res.json(closes);
  } catch (error) {
    next(error);
  }
};

export const eliminarCierreCaja = async (req, res, next) => {
  try {
    const close = await CierreCaja.findById(req.params.id);
    if (!close) {
      return res.status(404).json({ message: 'Cierre no encontrado' });
    }
    if (close.estado === 'abierto') {
      return res.status(409).json({ message: 'No se puede eliminar una caja abierta. Cerrala primero.' });
    }
    await CierreCaja.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cierre eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

const obtenerVentanaDeCierre = async (close) => {
  const fecha = close.fecha;
  const dayMs = 86400000;

  if (close.turno === 'dia') {
    return {
      desde: close.abiertaEn || close.desde || fecha,
      hasta: close.cerradaEn || close.hasta || new Date(fecha.getTime() + dayMs),
    };
  }

  let desde = close.desde;
  let hasta = close.hasta;

  if (!desde) {
    if (close.turno === 'tarde') {
      const mananaClose = await CierreCaja.findOne({ fecha, turno: 'manana' });
      desde = (mananaClose && mananaClose.hasta) || fecha;
    } else {
      desde = fecha;
    }
  }

  if (!hasta) {
    hasta = new Date(fecha.getTime() + dayMs);
    if (close.turno === 'manana') {
      const tardeClose = await CierreCaja.findOne({ fecha, turno: 'tarde' });
      if (tardeClose?.desde && tardeClose.desde < hasta) {
        hasta = tardeClose.desde;
      }
    }
  }

  return { desde, hasta };
};

export const reenviarMailCierre = async (req, res, next) => {
  try {
    const close = await CierreCaja.findById(req.params.id);
    if (!close) {
      return res.status(404).json({ message: 'Cierre no encontrado' });
    }

    const offset = Number(req.body?.offset) || Number(req.query?.offset) || 0;

    const { desde, hasta } = await obtenerVentanaDeCierre(close);

    const sales = await Venta.find({ fechaCreacion: { $gte: desde, $lt: hasta } })
      .populate('articulos.producto', 'nombre categoria')
      .populate('producto', 'nombre categoria');

    let totalDia = null;
    if (close.turno === 'tarde') {
      const mananaClose = await CierreCaja.findOne({ fecha: close.fecha, turno: 'manana' });
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
      lugar: 'VentaController.js → reenviarMailCierre',
      stack: error.stack,
    });
    next(error);
  }
};

export const probarCorreo = async (req, res, next) => {
  try {
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : new Date().getTimezoneOffset();
    const datos = await enviarCorreoPrueba({ offset });
    res.json({ message: 'Mail de prueba enviado', asunto: datos.subject });
  } catch (error) {
    next(error);
  }
};

export const estadoCorreo = async (req, res, next) => {
  try {
    const datos = await verificarCorreo();
    res.json({ message: 'Conexión SMTP y autenticación OK', ...datos });
  } catch (error) {
    logger.error('No se pudo verificar el estado del mail', {
      motivo: error.message,
      queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
      origen: 'backend',
      lugar: 'VentaController.js → estadoCorreo',
      stack: error.stack,
    });
    const err = new Error('No se pudo conectar con el servidor de mail');
    err.statusCode = 502;
    next(err);
  }
};

export const migrarArticulosVenta = async () => {
  const pendientes = await Venta.countDocuments({
    $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }],
    producto: { $exists: true, $ne: null },
  });
  if (pendientes === 0) return 0;

  const cursor = Venta.find({
    $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }],
    producto: { $exists: true, $ne: null },
  }).cursor();

  let count = 0;
  for await (const venta of cursor) {
    const articulos = obtenerArticulos(venta);
    if (!articulos.length || !articulos[0].producto) continue;
    const fechaOriginal = venta.fechaCreacion || venta.createdAt;
    venta.articulos = articulos.map((i) => ({
      producto: i.producto,
      cantidad: i.cantidad,
      precio: i.precio,
      talle: i.talle || '',
      color: i.color || '',
      subtotal: i.subtotal ?? venta.total,
    }));
    await venta.save();
    if (fechaOriginal) {
      await Venta.updateOne({ _id: venta._id }, { $set: { fechaCreacion: fechaOriginal } });
    }
    count++;
  }
  return count;
};

export const ejecutarMigracion = async (req, res, next) => {
  try {
    const count = await migrarArticulosVenta();
    try {
      await CierreCaja.collection.dropIndex('fecha_1');
    } catch (error) {
      logger.debug('Índice fecha_1 no existía al migrar cierres', {
        origen: 'backend',
        lugar: 'VentaController.js:ejecutarMigracion',
        motivo: error.message,
      });
    }
    await CierreCaja.syncIndexes();
    res.json({ message: `Migradas ${count} ventas al formato articulos[]; índices de cierres actualizados` });
  } catch (error) {
    next(error);
  }
};

export const asegurarNumerosTicket = async () => {
  const sinTicket = {
    $or: [
      { ticketNumero: { $exists: false } },
      { ticketNumero: null },
      { ticketNumero: '' },
    ],
  };
  const pendientes = await Venta.countDocuments(sinTicket);
  if (pendientes === 0) return 0;

  const cursor = Venta.find(sinTicket).cursor();
  let count = 0;

  for await (const venta of cursor) {
    venta.ticketNumero = await generarTicketNumero();
    await venta.save();
    count++;
  }

  return count;
};

export const migrarTickets = async (req, res, next) => {
  try {
    const count = await asegurarNumerosTicket();
    res.json({ message: `Asignados números de ticket a ${count} ventas` });
  } catch (error) {
    next(error);
  }
};

export const obtenerEstadisticasVentas = async (req, res, next) => {
  try {
    const { desde, hasta, offset = 0 } = req.query;
    const filter = {};

    if (desde || hasta) {
      filter.fechaCreacion = obtenerRango(desde, hasta, offset);
    }

    const sales = await Venta.find(filter);

    const total = Math.round(sales.reduce((sum, s) => sum + totalNetoVenta(s), 0) * 100) / 100;
    const cantidad = sales.reduce((sum, s) => sum + unidadesNetasVenta(s), 0);

    const porMetodo = sales.reduce((acc, s) => {
      const unidadesNetas = unidadesNetasVenta(s);
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