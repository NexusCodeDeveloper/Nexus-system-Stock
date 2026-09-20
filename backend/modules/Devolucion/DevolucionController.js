import mongoose from 'mongoose';
import Devolucion from './DevolucionModel.js';
import Producto from '../Producto/ProductoModel.js';
import Venta from '../Venta/VentaModel.js';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../Venta/TicketUtils.js';
import { schemaCrearDevolucion } from './DevolucionSchema.js';
import { enviarEvento } from '../../services/PushService.js';
import { indiceDeVariante } from '../../utils/VariantesUtils.js';
import { obtenerArticulos, mismaLinea, prorratearPagos, totalEfectivoDePagos, esMismoDia } from '../../utils/VentasUtils.js';
import { encontrarCierreDeFecha, mensajeCierre } from '../../utils/CierresUtils.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/CajaUtils.js';

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const pagosDe = (venta) =>
  (venta?.pagos || []).map((p) => ({ metodo: p.metodo, monto: redondear(p.monto) }));

const materializarItems = (venta) => {
  if (!venta.articulos || venta.articulos.length === 0) {
    venta.articulos = obtenerArticulos(venta);
  }
  return venta.articulos;
};

export const crearDevolucion = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = schemaCrearDevolucion.parse(req.body);

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de registrar una devolución tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, Number(data.offset) || 0)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const product = await Producto.findById(data.producto).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.variantes?.length > 0) {
      const idx = indiceDeVariante(product, data.talle, data.color);
      if (idx === -1) {
        product.variantes.push({ talle: data.talle || '', color: data.color || '', cantidad: 0 });
      }
      product.variantes[idx === -1 ? product.variantes.length - 1 : idx].cantidad += data.cantidad;
    } else {
      product.cantidad += data.cantidad;
    }

    await product.save({ session });

    let pendiente = data.cantidad;
    let saleConsumida = null;
    let montoTotalDevuelto = 0;
    let precioUnitario = product.precio || 0;
    let descuentoAplicado = 0;
    let pagosOriginales = [];
    let pagosAntes = [];
    const sales = [];

    if (data.venta) {
      const targetSale = await Venta.findById(data.venta).session(session);
      if (!targetSale) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket no existe o ya fue devuelto' });
      }
      if (targetSale.estado === 'devuelta') {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket ya fue devuelto' });
      }
      const articulos = materializarItems(targetSale);
      const match = articulos.find((i) => mismaLinea(i, data));
      if (!match) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El producto no forma parte de este ticket' });
      }
      if (match.cantidad < data.cantidad) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Solo hay ${match.cantidad} unidad(es) de este producto en el ticket` });
      }
      sales.push(targetSale);
    }

    for (const venta of sales) {
      if (pendiente <= 0) break;
      saleConsumida = venta._id;

      const articulos = materializarItems(venta);
      const match = articulos.find((i) => mismaLinea(i, data));
      const saleCantidad = match?.cantidad ?? venta.cantidad ?? 0;
      const precioUnit = match?.precio ?? venta.precio ?? 0;
      const factorDescuento = 1 - (venta.descuento || 0) / 100;
      precioUnitario = precioUnit;
      descuentoAplicado = venta.descuento || 0;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        const montoDevuelto = redondear(precioUnit * saleCantidad * factorDescuento);
        montoTotalDevuelto = redondear(montoTotalDevuelto + montoDevuelto);
        const restantes = articulos.filter((i) => !mismaLinea(i, data));
        if (restantes.length > 0) {
          venta.articulos = restantes;
          const primerItem = venta.articulos[0];
          venta.producto = primerItem.producto;
          venta.cantidad = primerItem.cantidad;
          venta.precio = primerItem.precio;
          venta.talle = primerItem.talle || '';
          venta.total = redondear(
            venta.articulos.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) * factorDescuento
          );
        } else {
          pagosOriginales = pagosDe(venta);
          pagosAntes = pagosOriginales;
          venta.total = 0;
          venta.pagos = [];
          venta.estado = 'devuelta';
        }
        registrarDevolucionEnVenta(venta, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
        await venta.save({ session });
      } else {
        if (match) {
          match.cantidad -= pendiente;
          match.subtotal = redondear(match.precio * match.cantidad);
        } else if (Number.isFinite(venta.cantidad)) {
          venta.cantidad = Math.max(1, venta.cantidad - pendiente);
        }
        const sumSubtotales = materializarItems(venta).reduce(
          (s, i) => s + (i.subtotal ?? i.precio * i.cantidad),
          0
        );
        venta.total = redondear(sumSubtotales * factorDescuento);
        const montoDevuelto = redondear(precioUnit * pendiente * factorDescuento);
        montoTotalDevuelto = redondear(montoTotalDevuelto + montoDevuelto);
        pagosAntes = pagosDe(venta);
        registrarDevolucionEnVenta(venta, { motivo: data.motivo, cantidad: pendiente, monto: montoDevuelto });
        await venta.save({ session });
        pendiente = 0;
      }
    }

    if (data.venta && pendiente > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Solo se pueden devolver ${data.cantidad - pendiente} unidad(es): no hay más vendidas de este producto`,
      });
    }

    let montoSinTicket = 0;
    if (!data.venta) {
      montoSinTicket = redondear((product.precio || 0) * data.cantidad);
      precioUnitario = product.precio || 0;
    }

    const offset = Number(data.offset) || 0;
    let efectivoDevuelto = 0;
    if (!data.venta) {
      efectivoDevuelto = montoSinTicket;
    } else if (sales.length > 0 && !esMismoDia(sales[0].fechaCreacion, offset)) {
      const base = pagosAntes.length > 0 ? pagosAntes : pagosOriginales;
      efectivoDevuelto = base.length > 0
        ? totalEfectivoDePagos(prorratearPagos(base, montoTotalDevuelto))
        : (sales[0].metodoPago === 'efectivo' || !sales[0].metodoPago ? montoTotalDevuelto : 0);
    }

    const returnRecord = await Devolucion.create([{
      ...data,
      venta: data.venta || saleConsumida || null,
      diferencia: 0,
      montoDevuelto: data.venta ? montoTotalDevuelto : montoSinTicket,
      efectivoDevuelto,
      precioUnitario,
      descuentoAplicado,
      pagosOriginales,
    }], { session });

    const populated = await Devolucion.findById(returnRecord[0]._id)
      .session(session)
      .populate([
        { path: 'producto', select: 'nombre categoria' },
        { path: 'venta', select: 'ticketNumero total empleado' },
      ]);

    await session.commitTransaction();

    void enviarEvento({
      tipo: 'devolucion',
      titulo: 'Devolución registrada',
      mensaje: `${product.nombre} × ${data.cantidad}${data.venta ? ' · con ticket' : ' · sin ticket'}`,
      url: '/returns',
      para: 'admins',
    });

    res.status(201).json(populated);
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const eliminarDevolucion = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const returnRecord = await Devolucion.findById(req.params.id).session(session);
    if (!returnRecord) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    const cierre = await encontrarCierreDeFecha(returnRecord.fechaCreacion);
    if (cierre) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `No se puede eliminar una devolución que ya forma parte de un cierre.${mensajeCierre(cierre)}`,
      });
    }

    const mismoProducto = returnRecord.productoCargar
      && String(returnRecord.productoCargar) === String(returnRecord.producto);

    const product = await Producto.findById(returnRecord.producto).session(session);
    if (product) {
      if (product.variantes?.length > 0) {
        const idx = indiceDeVariante(product, returnRecord.talle, returnRecord.color);
        if (idx === -1) {
          await session.abortTransaction();
          return res.status(409).json({
            message: `La variante "${[returnRecord.talle, returnRecord.color].filter(Boolean).join(' / ') || 'sin variante'}" ya no existe en "${product.nombre}". Revisá el stock antes de eliminar la devolución.`,
          });
        }
        product.variantes[idx].cantidad = Math.max(0, product.variantes[idx].cantidad - returnRecord.cantidad);
      } else {
        product.cantidad = Math.max(0, product.cantidad - returnRecord.cantidad);
      }
      await product.save({ session });
    }

    if (returnRecord.productoCargar) {
      const productoCargado = mismoProducto
        ? product
        : await Producto.findById(returnRecord.productoCargar).session(session);
      if (productoCargado) {
        if (productoCargado.variantes?.length > 0) {
          const idx = indiceDeVariante(productoCargado, returnRecord.talleCargar, returnRecord.colorCargar);
          if (idx === -1) {
            productoCargado.variantes.push({
              talle: returnRecord.talleCargar || '',
              color: returnRecord.colorCargar || '',
              cantidad: returnRecord.cantidadCargar,
            });
          } else {
            productoCargado.variantes[idx].cantidad += returnRecord.cantidadCargar;
          }
        } else {
          productoCargado.cantidad += returnRecord.cantidadCargar;
        }
        await productoCargado.save({ session });
      }
    }

    if (returnRecord.venta) {
      const venta = await Venta.findById(returnRecord.venta).session(session);
      if (venta) {
        const eraDevuelta = venta.estado === 'devuelta';
        const articulos = (venta.articulos && venta.articulos.length > 0)
          ? venta.articulos
          : (eraDevuelta ? [] : materializarItems(venta));
        const match = articulos.find((i) => mismaLinea(i, {
          producto: returnRecord.producto,
          talle: returnRecord.talle,
          color: returnRecord.color,
        }));

        if (match) {
          if (!eraDevuelta) {
            match.cantidad += returnRecord.cantidad;
            match.subtotal = redondear(match.precio * match.cantidad);
          }
        } else {
          const precio = returnRecord.precioUnitario || product?.precio || 0;
          venta.articulos.push({
            producto: returnRecord.producto,
            cantidad: returnRecord.cantidad,
            precio,
            talle: returnRecord.talle || '',
            color: returnRecord.color || '',
            subtotal: redondear(precio * returnRecord.cantidad),
          });
        }

        if (venta.articulos?.length > 0) {
          venta.total = redondear(
            venta.articulos.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) *
              (1 - (venta.descuento || 0) / 100)
          );
        }

        if (eraDevuelta) {
          venta.estado = 'activa';
          const pagos = (returnRecord.pagosOriginales || []).filter((p) => (p.monto || 0) > 0);
          venta.pagos = pagos.length > 0
            ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }))
            : [{ metodo: venta.metodoPago || 'efectivo', monto: redondear(venta.total) }];
          venta.cantidadDevuelta = Math.max(0, redondear((venta.cantidadDevuelta || 0) - returnRecord.cantidad));
          venta.montoDevuelto = Math.max(0, redondear((venta.montoDevuelto || 0) - (returnRecord.montoDevuelto || 0)));
          if (venta.devoluciones?.length > 0) {
            const idx = venta.devoluciones
              .map((d, i) => ({ d, i }))
              .filter(({ d }) => redondear(d.monto) === redondear(returnRecord.montoDevuelto) && (d.cantidad || 0) === returnRecord.cantidad)
              .pop()?.i;
            if (idx !== undefined) venta.devoluciones.splice(idx, 1);
            else venta.devoluciones.pop();
          }
        } else {
          anularDevolucionEnVenta(venta, { cantidad: returnRecord.cantidad, monto: returnRecord.montoDevuelto || 0 });
        }

        await venta.save({ session });
      }
    }

    if (returnRecord.ventaDiferenciaId) {
      const ventaDiferencia = await Venta.findById(returnRecord.ventaDiferenciaId).session(session);
      if (ventaDiferencia) {
        await Venta.findByIdAndDelete(returnRecord.ventaDiferenciaId).session(session);
      }
    }

    await Devolucion.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const obtenerDevoluciones = async (req, res, next) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const returns = await Devolucion.find()
      .populate('producto', 'nombre categoria')
      .populate('venta', 'ticketNumero total empleado')
      .sort({ fechaCreacion: -1 })
      .limit(limite);

    res.json(returns);
  } catch (error) {
    next(error);
  }
};
