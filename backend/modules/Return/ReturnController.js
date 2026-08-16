import mongoose from 'mongoose';
import Return from './ReturnModel.js';
import Product from '../Product/ProductModel.js';
import Sale from '../Sale/SaleModel.js';
import { registrarDevolucionEnVenta } from '../Sale/ticketUtils.js';
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
    }

    await product.save({ session });

    let pendiente = data.cantidad;
    let sales;
    if (data.sale) {
      const targetSale = await Sale.findById(data.sale).session(session);
      if (!targetSale) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket no existe o ya fue devuelto' });
      }
      const match = targetSale.items?.find((i) => i.producto?.toString() === data.producto);
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
          { 'items.producto': data.producto },
        ],
      }).sort({ createdAt: -1 }).session(session);
    }

    for (const sale of sales) {
      if (pendiente <= 0) break;

      const match = sale.items?.find((i) => i.producto?.toString() === data.producto);
      const saleCantidad = match?.cantidad ?? sale.cantidad ?? 0;
      const precioUnit = match?.precio ?? sale.precio ?? 0;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        if (data.sale) {
          const montoDevuelto = precioUnit * saleCantidad;
          if (sale.items && sale.items.length > 1) {
            sale.items = sale.items.filter((i) => i.producto?.toString() !== data.producto);
            const primerItem = sale.items[0];
            sale.producto = primerItem.producto;
            sale.cantidad = primerItem.cantidad;
            sale.precio = primerItem.precio;
            sale.talle = primerItem.talle || '';
            sale.total = sale.items.reduce((s, i) => s + i.subtotal, 0);
            registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
          } else {
            sale.total = 0;
            sale.pagos = [];
            sale.metodoPago = '';
            sale.estado = 'devuelta';
            registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: saleCantidad, monto: montoDevuelto });
          }
          await sale.save({ session });
        } else if (sale.items && sale.items.length > 1) {
          sale.items = sale.items.filter((i) => i.producto?.toString() !== data.producto);
          const primerItem = sale.items[0];
          sale.producto = primerItem.producto;
          sale.cantidad = primerItem.cantidad;
          sale.precio = primerItem.precio;
          sale.talle = primerItem.talle || '';
          sale.total = sale.items.reduce((s, i) => s + i.subtotal, 0);
          await sale.save({ session });
        } else {
          await Sale.findByIdAndDelete(sale._id).session(session);
        }
      } else {
        if (match) {
          match.cantidad -= pendiente;
          match.subtotal = match.precio * match.cantidad;
        }
        sale.total = sale.items ? sale.items.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) : (sale.cantidad - pendiente) * (sale.precio ?? 0);
        if (data.sale) {
          registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: pendiente, monto: precioUnit * pendiente });
        }
        await sale.save({ session });
        pendiente = 0;
      }
    }

    const returnRecord = await Return.create([{ ...data, sale: data.sale || null, diferencia: 0 }], { session });

    await session.commitTransaction();

    const populated = await returnRecord[0].populate('producto', 'nombre');

    res.status(201).json(populated);
  } catch (error) {
    await session.abortTransaction();
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
      }
      await product.save({ session });
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