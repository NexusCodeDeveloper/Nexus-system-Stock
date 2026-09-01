import mongoose from 'mongoose';
import Product from './ProductModel.js';
import Return from '../Return/ReturnModel.js';
import Sale from '../Sale/SaleModel.js';
import Supplier from '../Supplier/SupplierModel.js';
import { guardarConTicketUnico, registrarDevolucionEnVenta } from '../Sale/ticketUtils.js';
import { createProductSchema, updateProductSchema, exchangeSchema, addStockSchema } from './ProductSchema.js';
import { enviarEvento, enviarStockBajo } from '../../services/pushService.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findVariant = (product, talle, color) => {
  return product.variants.find((v) => v.talle === (talle || '') && v.color === (color || ''));
};

const findVariantIdx = (product, talle, color) => {
  return product.variants.findIndex((v) => v.talle === (talle || '') && v.color === (color || ''));
};

export const getProducts = async (req, res, next) => {
  try {
    const { search, categoria } = req.query;
    const filter = {};

    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { nombre: { $regex: safe, $options: 'i' } },
        { categoria: { $regex: safe, $options: 'i' } },
      ];
    }
    if (categoria) {
      filter.categoria = { $regex: escapeRegex(categoria), $options: 'i' };
    }

    const products = await Product.find(filter).sort({ nombre: 1 });

    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);

    const existing = await Product.findOne({ nombre: { $regex: `^${escapeRegex(data.nombre)}$`, $options: 'i' } });
    if (existing) {
      return res.status(409).json({ message: `Ya existe un producto llamado "${data.nombre}"` });
    }

    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (data.nombre) {
      const existing = await Product.findOne({
        nombre: { $regex: `^${escapeRegex(data.nombre)}$`, $options: 'i' },
        _id: { $ne: product._id },
      });
      if (existing) {
        return res.status(409).json({ message: `Ya existe un producto llamado "${data.nombre}"` });
      }
    }

    Object.assign(product, data);
    await product.save();

    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const addStock = async (req, res, next) => {
  try {
    const { cantidad, talle, color } = addStockSchema.parse(req.body);

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.variants?.length > 0) {
      const idx = findVariantIdx(product, talle, color);
      if (idx === -1) {
        product.variants.push({ talle: talle || '', color: color || '', cantidad });
      } else {
        product.variants[idx].cantidad += cantidad;
      }
    } else {
      product.cantidad += cantidad;
    }

    await product.save();

    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const exchangeProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const data = exchangeSchema.parse(req.body);

    const productoDevuelto = await Product.findById(data.productoDevolver).session(session);
    if (!productoDevuelto) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto a devolver no encontrado' });
    }

    const productoCargado = await Product.findById(data.productoCargar).session(session);
    if (!productoCargado) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto a cargar no encontrado' });
    }

    // Validate variants
    if (productoDevuelto.variants?.length > 0) {
      const devolverVariant = findVariant(productoDevuelto, data.talleDevolver, data.colorDevolver);
      if (!devolverVariant) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Variante no encontrada en "${productoDevuelto.nombre}" a devolver` });
      }
    }

    if (productoCargado.variants?.length > 0) {
      const cargarVariant = findVariant(productoCargado, data.talleCargar, data.colorCargar);
      if (!cargarVariant) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Variante no encontrada en "${productoCargado.nombre}" a cargar` });
      }
      if (cargarVariant.cantidad < data.cantidadCargar) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${cargarVariant.cantidad} unidad(es).`,
        });
      }
    }

    let saleTicket = null;
    if (data.sale) {
      saleTicket = await Sale.findById(data.sale).session(session);
      if (!saleTicket) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket no existe o ya fue devuelto' });
      }
      if (saleTicket.estado === 'devuelta') {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El ticket ya fue devuelto' });
      }
      const match = saleTicket.items?.find(
        (i) => i.producto?.toString() === data.productoDevolver
          && (i.talle || '') === (data.talleDevolver || '')
          && (i.color || '') === (data.colorDevolver || '')
      );
      if (!match) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'El producto no forma parte de este ticket' });
      }
      if (match.cantidad < data.cantidadDevolver) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Solo hay ${match.cantidad} unidad(es) de este producto en el ticket` });
      }
    }

    // Add stock back to returned product
    if (productoDevuelto.variants?.length > 0) {
      const idx = findVariantIdx(productoDevuelto, data.talleDevolver, data.colorDevolver);
      if (idx === -1) {
        productoDevuelto.variants.push({ talle: data.talleDevolver || '', color: data.colorDevolver || '', cantidad: 0 });
      }
      const targetIdx = idx === -1 ? productoDevuelto.variants.length - 1 : idx;
      productoDevuelto.variants[targetIdx].cantidad += data.cantidadDevolver;
    } else {
      productoDevuelto.cantidad += data.cantidadDevolver;
    }

    // Deduct stock from new product
    if (productoCargado.variants?.length > 0) {
      const idx = findVariantIdx(productoCargado, data.talleCargar, data.colorCargar);
      if (idx === -1) {
        productoCargado.variants.push({ talle: data.talleCargar || '', color: data.colorCargar || '', cantidad: 0 });
      }
      const targetIdx = idx === -1 ? productoCargado.variants.length - 1 : idx;
      productoCargado.variants[targetIdx].cantidad -= data.cantidadCargar;
    } else {
      if (productoCargado.cantidad < data.cantidadCargar) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${productoCargado.cantidad} unidad(es).`,
        });
      }
      productoCargado.cantidad -= data.cantidadCargar;
    }

    await productoDevuelto.save({ session });
    await productoCargado.save({ session });

    const precioDevuelto = saleTicket
      ? (saleTicket.items?.find((i) => i.producto?.toString() === data.productoDevolver)?.precio ?? productoDevuelto.precio)
      : productoDevuelto.precio;
    const factorDescuentoTicket = 1 - (saleTicket?.descuento || 0) / 100;
    const devolverValor = Math.round(precioDevuelto * data.cantidadDevolver * factorDescuentoTicket * 100) / 100;
    const cargarValor = Math.round(productoCargado.precio * data.cantidadCargar * 100) / 100;
    const diferencia = Math.round((cargarValor - devolverValor) * 100) / 100;

    let pendiente = data.cantidadDevolver;
    let saleConsumida = null;
    let montoTotalDevuelto = 0;
    let sales;
    if (saleTicket) {
      sales = [saleTicket];
    } else {
      sales = await Sale.find({
        $or: [
          { producto: data.productoDevolver },
          { items: { $elemMatch: { producto: data.productoDevolver, talle: data.talleDevolver || '', color: data.colorDevolver || '' } } },
        ],
        estado: { $ne: 'devuelta' },
      }).sort({ createdAt: -1 }).session(session);
    }

    for (const sale of sales) {
      if (pendiente <= 0) break;
      saleConsumida = sale._id;

      const match = sale.items?.find(
        (i) => i.producto?.toString() === data.productoDevolver
          && (i.talle || '') === (data.talleDevolver || '')
          && (i.color || '') === (data.colorDevolver || '')
      );
      const saleCantidad = match?.cantidad ?? sale.cantidad ?? 0;
      const precioUnit = match?.precio ?? sale.precio ?? 0;
      const factorDescuento = 1 - (sale.descuento || 0) / 100;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        const montoDevuelto = Math.round(precioUnit * saleCantidad * factorDescuento * 100) / 100;
        montoTotalDevuelto = Math.round((montoTotalDevuelto + montoDevuelto) * 100) / 100;
        if (sale.items && sale.items.length > 1) {
          sale.items = sale.items.filter((i) => i.producto?.toString() !== data.productoDevolver);
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
        message: `Solo se pueden devolver ${data.cantidadDevolver - pendiente} unidad(es): no hay más vendidas de este producto para cubrir el cambio`,
      });
    }

    let ventaDiferencia = null;
    if (diferencia > 0) {
      const empleado = saleTicket?.empleado || data.empleado || 'Cambio';
      const metodo = data.metodoPago || saleTicket?.pagos?.[0]?.metodo || 'efectivo';
      ventaDiferencia = await Sale.create([{
        items: [{
          producto: data.productoCargar,
          cantidad: data.cantidadCargar,
          precio: productoCargado.precio,
          talle: data.talleCargar || '',
          color: data.colorCargar || '',
          subtotal: diferencia,
        }],
        total: diferencia,
        empleado,
        pagos: [{ metodo, monto: diferencia }],
        descuento: 0,
      }], { session });
      await guardarConTicketUnico(ventaDiferencia[0], session);
    }

    await Return.create([{
      producto: data.productoDevolver,
      cantidad: data.cantidadDevolver,
      talle: data.talleDevolver || '',
      color: data.colorDevolver || '',
      productoCargar: data.productoCargar,
      cantidadCargar: data.cantidadCargar,
      talleCargar: data.talleCargar || '',
      colorCargar: data.colorCargar || '',
      sale: data.sale || saleConsumida || null,
      diferencia,
      montoDevuelto: montoTotalDevuelto,
      ventaDiferenciaId: ventaDiferencia ? ventaDiferencia[0]._id : null,
      motivo: data.motivo || `Cambio por ${productoCargado.nombre}`,
    }], { session });

    await session.commitTransaction();

    void enviarEvento({
      tipo: 'devolucion',
      titulo: 'Cambio registrado',
      mensaje: `${productoDevuelto.nombre} → ${productoCargado.nombre}`,
      url: '/returns',
      para: 'admins',
    });
    void enviarStockBajo([productoCargado]);

    res.json({
      message: diferencia > 0
        ? `Cambio registrado. Diferencia a cobrar: $${diferencia.toFixed(2)}`
        : diferencia < 0
          ? `Cambio registrado. Diferencia a favor del cliente: $${Math.abs(diferencia).toFixed(2)}`
          : 'Cambio registrado correctamente',
      productoDevuelto,
      productoCargado,
      diferencia,
      ventaDiferenciaId: ventaDiferencia ? ventaDiferencia[0]._id : null,
      ticketDiferencia: ventaDiferencia ? ventaDiferencia[0].ticketNumero : null,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const totalProductos = await Product.countDocuments();
    const totalCategorias = await Product.distinct('categoria').then((cats) => cats.length);
    const totalProveedores = await Supplier.countDocuments();
    const totalDevoluciones = await Return.countDocuments();

    res.json({
      totalProductos,
      totalCategorias,
      totalProveedores,
      totalDevoluciones,
    });
  } catch (error) {
    next(error);
  }
};

export const migrateVariants = async (req, res, next) => {
  try {
    const products = await Product.find({
      $or: [
        { talles: { $exists: true, $ne: [] } },
        { colores: { $exists: true, $ne: [] } },
      ],
    });

    let count = 0;
    for (const product of products) {
      const variants = [];

      // Convert talles to variants
      if (product.talles?.length > 0) {
        for (const t of product.talles) {
          variants.push({ talle: t.talle, color: '', cantidad: t.cantidad });
        }
      }

      // Convert colores to variants (only if no talles existed)
      if (!product.talles?.length && product.colores?.length > 0) {
        for (const c of product.colores) {
          variants.push({ talle: '', color: c.color, cantidad: c.cantidad });
        }
      }

      product.variants = variants;
      product.talles = undefined;
      product.colores = undefined;
      await product.save();
      count++;
    }

    res.json({ message: `Migrados ${count} productos al formato variants` });
  } catch (error) {
    next(error);
  }
};

export const getLowStock = async (req, res, next) => {
  try {
    const products = await Product.find();

    const lowStock = [];
    for (const product of products) {
      const stockMinimo = product.stockMinimo ?? 0;
      if (product.variants?.length > 0) {
        for (const v of product.variants) {
          if (v.cantidad <= stockMinimo) {
            lowStock.push({
              productoId: product._id,
              productoNombre: product.nombre,
              talle: v.talle,
              color: v.color,
              cantidad: v.cantidad,
              stockMinimo,
            });
          }
        }
      } else if (product.cantidad <= stockMinimo) {
        lowStock.push({
          productoId: product._id,
          productoNombre: product.nombre,
          talle: '',
          color: '',
          cantidad: product.cantidad,
          stockMinimo,
        });
      }
    }

    res.json(lowStock.sort((a, b) => a.cantidad - b.cantidad));
  } catch (error) {
    next(error);
  }
};