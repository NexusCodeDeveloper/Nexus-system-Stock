import mongoose from 'mongoose';
import Return from './ReturnModel.js';
import Product from '../Product/ProductModel.js';
import Sale from '../Sale/SaleModel.js';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../Sale/ticketUtils.js';
import { createReturnSchema } from './ReturnSchema.js';
import { enviarEvento } from '../../services/pushService.js';
import { findVariantIdx } from '../../utils/variantes.js';
import { getItems, mismaLinea, prorratearPagos, totalEfectivoDePagos, esMismoDia } from '../../utils/ventas.js';
import { encontrarCierreDeFecha, mensajeCierre } from '../../utils/cierres.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/caja.js';

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const pagosDe = (sale) =>
  (sale?.pagos || []).map((p) => ({ metodo: p.metodo, monto: redondear(p.monto) }));

const materializarItems = (sale) => {
  if (!sale.items || sale.items.length === 0) {
    sale.items = getItems(sale);
  }
  return sale.items;
};

export const createReturn = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = createReturnSchema.parse(req.body);

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de registrar una devolución tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, Number(data.offset) || 0)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const product = await Product.findById(data.producto).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.variants?.length > 0) {
      const idx = findVariantIdx(product, data.talle, data.color);
      if (idx === -1) {
        product.variants.push({ talle: data.talle || '', color: data.color || '', cantidad: 0 });
      }
      product.variants[idx === -1 ? product.variants.length - 1 : idx].cantidad += data.cantidad;
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

    if (data.sale) {
      const targetSale = await Sale.findById(data.sale).session(session);
      if (!targetSale) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket no existe o ya fue devuelto' });
      }
      if (targetSale.estado === 'devuelta') {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket ya fue devuelto' });
      }
      const items = materializarItems(targetSale);
      const match = items.find((i) => mismaLinea(i, data));
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

    for (const sale of sales) {
      if (pendiente <= 0) break;
      saleConsumida = sale._id;

      const items = materializarItems(sale);
      const match = items.find((i) => mismaLinea(i, data));
      const saleCantidad = match?.cantidad ?? sale.cantidad ?? 0;
      const precioUnit = match?.precio ?? sale.precio ?? 0;
      const factorDescuento = 1 - (sale.descuento || 0) / 100;
      precioUnitario = precioUnit;
      descuentoAplicado = sale.descuento || 0;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        const montoDevuelto = redondear(precioUnit * saleCantidad * factorDescuento);
        montoTotalDevuelto = redondear(montoTotalDevuelto + montoDevuelto);
        const restantes = items.filter((i) => !mismaLinea(i, data));
        if (restantes.length > 0) {
          sale.items = restantes;
          const primerItem = sale.items[0];
          sale.producto = primerItem.producto;
          sale.cantidad = primerItem.cantidad;
          sale.precio = primerItem.precio;
          sale.talle = primerItem.talle || '';
          sale.total = redondear(
            sale.items.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) * factorDescuento
          );
        } else {
          pagosOriginales = pagosDe(sale);
          pagosAntes = pagosOriginales;
          sale.total = 0;
          sale.pagos = [];
          sale.estado = 'devuelta';
        }
        registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
        await sale.save({ session });
      } else {
        if (match) {
          match.cantidad -= pendiente;
          match.subtotal = redondear(match.precio * match.cantidad);
        } else if (Number.isFinite(sale.cantidad)) {
          sale.cantidad = Math.max(1, sale.cantidad - pendiente);
        }
        const sumSubtotales = materializarItems(sale).reduce(
          (s, i) => s + (i.subtotal ?? i.precio * i.cantidad),
          0
        );
        sale.total = redondear(sumSubtotales * factorDescuento);
        const montoDevuelto = redondear(precioUnit * pendiente * factorDescuento);
        montoTotalDevuelto = redondear(montoTotalDevuelto + montoDevuelto);
        pagosAntes = pagosDe(sale);
        registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: pendiente, monto: montoDevuelto });
        await sale.save({ session });
        pendiente = 0;
      }
    }

    if (data.sale && pendiente > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Solo se pueden devolver ${data.cantidad - pendiente} unidad(es): no hay más vendidas de este producto`,
      });
    }

    let montoSinTicket = 0;
    if (!data.sale) {
      montoSinTicket = redondear((product.precio || 0) * data.cantidad);
      precioUnitario = product.precio || 0;
    }

    const offset = Number(data.offset) || 0;
    let efectivoDevuelto = 0;
    if (!data.sale) {
      efectivoDevuelto = montoSinTicket;
    } else if (sales.length > 0 && !esMismoDia(sales[0].createdAt, offset)) {
      const base = pagosAntes.length > 0 ? pagosAntes : pagosOriginales;
      efectivoDevuelto = base.length > 0
        ? totalEfectivoDePagos(prorratearPagos(base, montoTotalDevuelto))
        : (sales[0].metodoPago === 'efectivo' || !sales[0].metodoPago ? montoTotalDevuelto : 0);
    }

    const returnRecord = await Return.create([{
      ...data,
      sale: data.sale || saleConsumida || null,
      diferencia: 0,
      montoDevuelto: data.sale ? montoTotalDevuelto : montoSinTicket,
      efectivoDevuelto,
      precioUnitario,
      descuentoAplicado,
      pagosOriginales,
    }], { session });

    const populated = await Return.findById(returnRecord[0]._id)
      .session(session)
      .populate([
        { path: 'producto', select: 'nombre categoria' },
        { path: 'sale', select: 'ticketNumero total empleado' },
      ]);

    await session.commitTransaction();

    void enviarEvento({
      tipo: 'devolucion',
      titulo: 'Devolución registrada',
      mensaje: `${product.nombre} × ${data.cantidad}${data.sale ? ' · con ticket' : ' · sin ticket'}`,
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

export const deleteReturn = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const returnRecord = await Return.findById(req.params.id).session(session);
    if (!returnRecord) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    const cierre = await encontrarCierreDeFecha(returnRecord.createdAt);
    if (cierre) {
      await session.abortTransaction();
      return res.status(409).json({
        message: `No se puede eliminar una devolución que ya forma parte de un cierre.${mensajeCierre(cierre)}`,
      });
    }

    const mismoProducto = returnRecord.productoCargar
      && String(returnRecord.productoCargar) === String(returnRecord.producto);

    const product = await Product.findById(returnRecord.producto).session(session);
    if (product) {
      if (product.variants?.length > 0) {
        const idx = findVariantIdx(product, returnRecord.talle, returnRecord.color);
        if (idx === -1) {
          await session.abortTransaction();
          return res.status(409).json({
            message: `La variante "${[returnRecord.talle, returnRecord.color].filter(Boolean).join(' / ') || 'sin variante'}" ya no existe en "${product.nombre}". Revisá el stock antes de eliminar la devolución.`,
          });
        }
        product.variants[idx].cantidad = Math.max(0, product.variants[idx].cantidad - returnRecord.cantidad);
      } else {
        product.cantidad = Math.max(0, product.cantidad - returnRecord.cantidad);
      }
      await product.save({ session });
    }

    if (returnRecord.productoCargar) {
      const productoCargado = mismoProducto
        ? product
        : await Product.findById(returnRecord.productoCargar).session(session);
      if (productoCargado) {
        if (productoCargado.variants?.length > 0) {
          const idx = findVariantIdx(productoCargado, returnRecord.talleCargar, returnRecord.colorCargar);
          if (idx === -1) {
            productoCargado.variants.push({
              talle: returnRecord.talleCargar || '',
              color: returnRecord.colorCargar || '',
              cantidad: returnRecord.cantidadCargar,
            });
          } else {
            productoCargado.variants[idx].cantidad += returnRecord.cantidadCargar;
          }
        } else {
          productoCargado.cantidad += returnRecord.cantidadCargar;
        }
        await productoCargado.save({ session });
      }
    }

    if (returnRecord.sale) {
      const sale = await Sale.findById(returnRecord.sale).session(session);
      if (sale) {
        const eraDevuelta = sale.estado === 'devuelta';
        const items = (sale.items && sale.items.length > 0)
          ? sale.items
          : (eraDevuelta ? [] : materializarItems(sale));
        const match = items.find((i) => mismaLinea(i, {
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
          sale.items.push({
            producto: returnRecord.producto,
            cantidad: returnRecord.cantidad,
            precio,
            talle: returnRecord.talle || '',
            color: returnRecord.color || '',
            subtotal: redondear(precio * returnRecord.cantidad),
          });
        }

        if (sale.items?.length > 0) {
          sale.total = redondear(
            sale.items.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) *
              (1 - (sale.descuento || 0) / 100)
          );
        }

        if (eraDevuelta) {
          sale.estado = 'activa';
          const pagos = (returnRecord.pagosOriginales || []).filter((p) => (p.monto || 0) > 0);
          sale.pagos = pagos.length > 0
            ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }))
            : [{ metodo: sale.metodoPago || 'efectivo', monto: redondear(sale.total) }];
          sale.cantidadDevuelta = Math.max(0, redondear((sale.cantidadDevuelta || 0) - returnRecord.cantidad));
          sale.montoDevuelto = Math.max(0, redondear((sale.montoDevuelto || 0) - (returnRecord.montoDevuelto || 0)));
          if (sale.devoluciones?.length > 0) {
            const idx = sale.devoluciones
              .map((d, i) => ({ d, i }))
              .filter(({ d }) => redondear(d.monto) === redondear(returnRecord.montoDevuelto) && (d.cantidad || 0) === returnRecord.cantidad)
              .pop()?.i;
            if (idx !== undefined) sale.devoluciones.splice(idx, 1);
            else sale.devoluciones.pop();
          }
        } else {
          anularDevolucionEnVenta(sale, { cantidad: returnRecord.cantidad, monto: returnRecord.montoDevuelto || 0 });
        }

        await sale.save({ session });
      }
    }

    if (returnRecord.ventaDiferenciaId) {
      const ventaDiferencia = await Sale.findById(returnRecord.ventaDiferenciaId).session(session);
      if (ventaDiferencia) {
        await Sale.findByIdAndDelete(returnRecord.ventaDiferenciaId).session(session);
      }
    }

    await Return.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const getReturns = async (req, res, next) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const returns = await Return.find()
      .populate('producto', 'nombre categoria')
      .populate('sale', 'ticketNumero total empleado')
      .sort({ createdAt: -1 })
      .limit(limite);

    res.json(returns);
  } catch (error) {
    next(error);
  }
};
