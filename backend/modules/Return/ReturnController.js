import mongoose from 'mongoose';
import Return from './ReturnModel.js';
import Product from '../Product/ProductModel.js';
import Sale from '../Sale/SaleModel.js';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../Sale/ticketUtils.js';
import { createReturnSchema } from './ReturnSchema.js';

const findVariantIdx = (product, talle, color) => {
  return product.variants.findIndex((v) => v.talle === (talle || '') && v.color === (color || ''));
};

export const createReturn = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const data = createReturnSchema.parse(req.body);

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
    let sales;
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
      const match = targetSale.items?.find(
        (i) => i.producto?.toString() === data.producto
          && (i.talle || '') === (data.talle || '')
          && (i.color || '') === (data.color || '')
      );
      if (!match) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El producto no forma parte de este ticket' });
      }
      if (match.cantidad < data.cantidad) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Solo hay ${match.cantidad} unidad(es) de este producto en el ticket` });
      }
      sales = [targetSale];
    } else {
      sales = await Sale.find({
        $or: [
          { producto: data.producto },
          { items: { $elemMatch: { producto: data.producto, talle: data.talle || '', color: data.color || '' } } },
        ],
        estado: { $ne: 'devuelta' },
      }).sort({ createdAt: -1 }).session(session);
    }

    for (const sale of sales) {
      if (pendiente <= 0) break;
      saleConsumida = sale._id;

      const match = sale.items?.find(
        (i) => i.producto?.toString() === data.producto
          && (i.talle || '') === (data.talle || '')
          && (i.color || '') === (data.color || '')
      );
      const saleCantidad = match?.cantidad ?? sale.cantidad ?? 0;
      const precioUnit = match?.precio ?? sale.precio ?? 0;
      const factorDescuento = 1 - (sale.descuento || 0) / 100;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        const montoDevuelto = Math.round(precioUnit * saleCantidad * factorDescuento * 100) / 100;
        montoTotalDevuelto = Math.round((montoTotalDevuelto + montoDevuelto) * 100) / 100;
        if (sale.items && sale.items.length > 1) {
          sale.items = sale.items.filter((i) => i.producto?.toString() !== data.producto);
          const primerItem = sale.items[0];
          sale.producto = primerItem.producto;
          sale.cantidad = primerItem.cantidad;
          sale.precio = primerItem.precio;
          sale.talle = primerItem.talle || '';
          sale.total = Math.round(sale.items.reduce((s, i) => s + i.subtotal, 0) * (1 - (sale.descuento || 0) / 100) * 100) / 100;
          registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
        } else {
          sale.total = 0;
          sale.pagos = [];
          sale.estado = 'devuelta';
          registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
        }
        await sale.save({ session });
      } else {
        if (match) {
          match.cantidad -= pendiente;
          match.subtotal = Math.round(match.precio * match.cantidad * 100) / 100;
        } else if (Number.isFinite(sale.cantidad)) {
          sale.cantidad = Math.max(1, sale.cantidad - pendiente);
        }
        const sumSubtotales = sale.items
          ? sale.items.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0)
          : (sale.cantidad - pendiente) * (sale.precio ?? 0);
        sale.total = Math.round(sumSubtotales * (1 - (sale.descuento || 0) / 100) * 100) / 100;
        const montoDevuelto = Math.round(precioUnit * pendiente * factorDescuento * 100) / 100;
        montoTotalDevuelto = Math.round((montoTotalDevuelto + montoDevuelto) * 100) / 100;
        registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: pendiente, monto: montoDevuelto });
        await sale.save({ session });
        pendiente = 0;
      }
    }

    if (pendiente > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Solo se pueden devolver ${data.cantidad - pendiente} unidad(es): no hay más vendidas de este producto`,
      });
    }

    const returnRecord = await Return.create([{
      ...data,
      sale: data.sale || saleConsumida || null,
      diferencia: 0,
      montoDevuelto: montoTotalDevuelto,
    }], { session });

    await session.commitTransaction();

    returnRecord[0].$session(null);
    const populated = await returnRecord[0].populate([
      { path: 'producto', select: 'nombre categoria' },
      { path: 'sale', select: 'ticketNumero total empleado' },
    ]);

    res.status(201).json(populated);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const deleteReturn = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const returnRecord = await Return.findById(req.params.id).session(session);
    if (!returnRecord) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    const product = await Product.findById(returnRecord.producto).session(session);
    if (product) {
      if (product.variants?.length > 0) {
        const idx = findVariantIdx(product, returnRecord.talle, returnRecord.color);
        if (idx !== -1) {
          product.variants[idx].cantidad -= returnRecord.cantidad;
          if (product.variants[idx].cantidad < 0) product.variants[idx].cantidad = 0;
        }
      } else {
        product.cantidad = Math.max(0, product.cantidad - returnRecord.cantidad);
      }
      await product.save({ session });
    }

    if (returnRecord.productoCargar) {
      const productoCargado = await Product.findById(returnRecord.productoCargar).session(session);
      if (productoCargado) {
        if (productoCargado.variants?.length > 0) {
          const idx = findVariantIdx(productoCargado, returnRecord.talleCargar, returnRecord.colorCargar);
          if (idx !== -1) {
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
        if (!eraDevuelta) {
          const match = sale.items?.find((i) => i.producto?.toString() === returnRecord.producto.toString());
          if (match) {
            match.cantidad += returnRecord.cantidad;
            match.subtotal = Math.round(match.precio * match.cantidad * 100) / 100;
          } else if (product) {
            sale.items.push({
              producto: returnRecord.producto,
              cantidad: returnRecord.cantidad,
              precio: product.precio,
              talle: returnRecord.talle || '',
              color: returnRecord.color || '',
              subtotal: Math.round(product.precio * returnRecord.cantidad * 100) / 100,
            });
          }
        }
        if (sale.items?.length > 0) {
          sale.total = Math.round(sale.items.reduce((s, i) => s + i.subtotal, 0) * (1 - (sale.descuento || 0) / 100) * 100) / 100;
        }
        const eraDevueltaFinal = sale.estado === 'devuelta';
        if (eraDevueltaFinal) {
          sale.estado = 'activa';
          sale.pagos = [{ metodo: sale.metodoPago || 'efectivo', monto: Math.round(sale.total * 100) / 100 }];
          sale.cantidadDevuelta = Math.max(0, Math.round(((sale.cantidadDevuelta || 0) - returnRecord.cantidad) * 100) / 100);
          sale.montoDevuelto = Math.max(0, Math.round(((sale.montoDevuelto || 0) - (returnRecord.montoDevuelto || 0)) * 100) / 100);
          if (sale.devoluciones?.length > 0) {
            sale.devoluciones.pop();
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
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const getReturns = async (req, res, next) => {
  try {
    const returns = await Return.find()
      .populate('producto', 'nombre categoria')
      .populate('sale', 'ticketNumero total empleado')
      .sort({ createdAt: -1 });

    res.json(returns);
  } catch (error) {
    next(error);
  }
};