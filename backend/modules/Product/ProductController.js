import mongoose from 'mongoose';
import Product from './ProductModel.js';
import Return from '../Return/ReturnModel.js';
import Sale from '../Sale/SaleModel.js';
import Supplier from '../Supplier/SupplierModel.js';
import Counter from '../Sale/CounterModel.js';
import StockMovement from '../StockMovement/StockMovementModel.js';
import { guardarConTicketUnico, registrarDevolucionEnVenta } from '../Sale/ticketUtils.js';
import { createProductSchema, updateProductSchema, exchangeSchema, addStockSchema, movimientoStockSchema, depositoSchema } from './ProductSchema.js';
import { enviarEvento, enviarStockBajo } from '../../services/pushService.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizarCodigo = (codigo) => {
  const limpio = String(codigo || '').trim();
  return limpio || undefined;
};

const buscarPorCodigoExacto = (codigo) =>
  Product.findOne({ codigo: { $regex: `^${escapeRegex(codigo)}$`, $options: 'i' } });

const CODIGO_INTERNO_REGEX = /^NC-\d{6}$/;

const intentarCodigoProducto = async () => {
  const counter = await Counter.findByIdAndUpdate(
    'producto',
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const codigo = `NC-${String(counter.seq).padStart(6, '0')}`;
  const repetido = await buscarPorCodigoExacto(codigo);
  return repetido ? null : codigo;
};

const sincronizarContadorProducto = async () => {
  const ultimo = await Product.findOne({ codigo: /^NC-\d{6}$/ })
    .sort({ codigo: -1 })
    .select('codigo')
    .lean();
  if (!ultimo) return;
  const seq = Number(String(ultimo.codigo).slice(3));
  if (!Number.isFinite(seq)) return;
  await Counter.findByIdAndUpdate(
    'producto',
    { $max: { seq } },
    { upsert: true, setDefaultsOnInsert: true }
  );
};

const generarCodigoProducto = async () => {
  for (let intento = 0; intento < 50; intento += 1) {
    const codigo = await intentarCodigoProducto();
    if (codigo) return codigo;
  }
  await sincronizarContadorProducto();
  for (let intento = 0; intento < 50; intento += 1) {
    const codigo = await intentarCodigoProducto();
    if (codigo) return codigo;
  }
  throw new Error('No se pudo generar un código único de producto');
};

const findVariant = (product, talle, color) => {
  return product.variants.find((v) => v.talle === (talle || '') && v.color === (color || ''));
};

const findVariantIdx = (product, talle, color) => {
  return product.variants.findIndex((v) => v.talle === (talle || '') && v.color === (color || ''));
};

const registrarMovimiento = async ({ producto, talle, color, tipo, cantidad, empleado }, session) => {
  await StockMovement.create(
    [{
      producto: producto._id,
      productoNombre: producto.nombre,
      talle: talle || '',
      color: color || '',
      tipo,
      cantidad,
      empleado: empleado || '',
    }],
    session ? { session } : undefined
  );
};

const depositoDe = (product, talle, color) => {
  if (product.variants?.length > 0) {
    const idx = findVariantIdx(product, talle, color);
    return idx === -1 ? 0 : (product.variants[idx].deposito || 0);
  }
  return product.deposito || 0;
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
        { codigo: { $regex: safe, $options: 'i' } },
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

export const getProductByCodigo = async (req, res, next) => {
  try {
    const codigo = normalizarCodigo(req.params.codigo);
    if (!codigo) {
      return res.status(400).json({ message: 'El código es requerido' });
    }
    const product = await buscarPorCodigoExacto(codigo);
    if (!product) {
      return res.status(404).json({ message: `No existe un producto con el código "${codigo}"` });
    }
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const siguienteCodigo = async (req, res, next) => {
  try {
    const codigo = await generarCodigoProducto();
    res.json({ codigo });
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

    const codigoSolicitado = normalizarCodigo(data.codigo);
    let codigo;
    if (codigoSolicitado && CODIGO_INTERNO_REGEX.test(codigoSolicitado)) {
      const repetido = await buscarPorCodigoExacto(codigoSolicitado);
      if (!repetido) codigo = codigoSolicitado;
    }
    if (!codigo) codigo = await generarCodigoProducto();

    try {
      const product = await Product.create({ ...data, codigo });
      return res.status(201).json(product);
    } catch (error) {
      if (error?.code === 11000) {
        const alternativo = await generarCodigoProducto();
        const product = await Product.create({ ...data, codigo: alternativo });
        return res.status(201).json(product);
      }
      throw error;
    }
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

    if (data.variants) {
      data.variants = data.variants.map((v) => {
        const idx = findVariantIdx(product, v.talle, v.color);
        return {
          ...v,
          cantidad: idx === -1 ? 0 : (product.variants[idx].cantidad || 0),
          deposito: Number(v.deposito) || 0,
        };
      });
    }

    Object.assign(product, data);
    await product.save();

    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const addStock = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { cantidad, talle, color } = addStockSchema.parse(req.body);

    const product = await Product.findById(req.params.id).session(session);
    if (!product) {
      await session.abortTransaction();
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

    await product.save({ session });

    await registrarMovimiento({
      producto: product,
      talle,
      color,
      tipo: 'ajuste_salon',
      cantidad,
      empleado: req.user?.nombre,
    }, session);

    await session.commitTransaction();
    res.json(product);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const addDeposito = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { cantidad, talle, color, modo } = depositoSchema.parse(req.body);

    const product = await Product.findById(req.params.id).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    let delta;
    if (product.variants?.length > 0) {
      let idx = findVariantIdx(product, talle, color);
      if (idx === -1) {
        product.variants.push({ talle: talle || '', color: color || '', cantidad: 0, deposito: 0 });
        idx = product.variants.length - 1;
      }
      const actual = product.variants[idx].deposito || 0;
      const nuevo = modo === 'fijar' ? cantidad : actual + cantidad;
      delta = nuevo - actual;
      product.variants[idx].deposito = nuevo;
    } else {
      const actual = product.deposito || 0;
      const nuevo = modo === 'fijar' ? cantidad : actual + cantidad;
      delta = nuevo - actual;
      product.deposito = nuevo;
    }

    if (delta === 0) {
      await session.abortTransaction();
      return res.json(product);
    }

    await product.save({ session });

    await registrarMovimiento({
      producto: product,
      talle,
      color,
      tipo: modo === 'fijar' ? 'ajuste_deposito' : 'ingreso_deposito',
      cantidad: Math.abs(delta),
      empleado: req.user?.nombre,
    }, session);

    await session.commitTransaction();
    res.json(product);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const reponerStock = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { cantidad, talle, color } = movimientoStockSchema.parse(req.body);

    const product = await Product.findById(req.params.id).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const disponible = depositoDe(product, talle, color);
    let actualizado;

    if (product.variants?.length > 0) {
      const idx = findVariantIdx(product, talle, color);
      if (idx === -1) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Variante no encontrada en "${product.nombre}"` });
      }
      if (disponible < cantidad) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `En depósito solo hay ${disponible} unidad(es) de "${product.nombre}".`,
        });
      }
      actualizado = await Product.findOneAndUpdate(
        {
          _id: product._id,
          variants: { $elemMatch: { talle: talle || '', color: color || '', deposito: { $gte: cantidad } } },
        },
        { $inc: { 'variants.$.deposito': -cantidad, 'variants.$.cantidad': cantidad, cantidad } },
        { new: true, session }
      );
    } else {
      if (disponible < cantidad) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `En depósito solo hay ${disponible} unidad(es) de "${product.nombre}".`,
        });
      }
      actualizado = await Product.findOneAndUpdate(
        { _id: product._id, deposito: { $gte: cantidad } },
        { $inc: { deposito: -cantidad, cantidad } },
        { new: true, session }
      );
    }

    if (!actualizado) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `En depósito solo hay ${disponible} unidad(es) de "${product.nombre}".`,
      });
    }

    await registrarMovimiento({
      producto: actualizado,
      talle,
      color,
      tipo: 'reposicion',
      cantidad,
      empleado: req.user?.nombre,
    }, session);

    await session.commitTransaction();
    res.json(actualizado);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
  }
};

export const retirarStock = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { cantidad, talle, color } = movimientoStockSchema.parse(req.body);

    const product = await Product.findById(req.params.id).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const disponible = product.variants?.length > 0
      ? (() => {
          const idx = findVariantIdx(product, talle, color);
          return idx === -1 ? 0 : (product.variants[idx].cantidad || 0);
        })()
      : (product.cantidad || 0);

    let actualizado;

    if (product.variants?.length > 0) {
      const idx = findVariantIdx(product, talle, color);
      if (idx === -1) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Variante no encontrada en "${product.nombre}"` });
      }
      if (disponible < cantidad) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `En salón solo hay ${disponible} unidad(es) de "${product.nombre}".`,
        });
      }
      actualizado = await Product.findOneAndUpdate(
        {
          _id: product._id,
          variants: { $elemMatch: { talle: talle || '', color: color || '', cantidad: { $gte: cantidad } } },
        },
        { $inc: { 'variants.$.deposito': cantidad, 'variants.$.cantidad': -cantidad, cantidad: -cantidad } },
        { new: true, session }
      );
    } else {
      if (disponible < cantidad) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `En salón solo hay ${disponible} unidad(es) de "${product.nombre}".`,
        });
      }
      actualizado = await Product.findOneAndUpdate(
        { _id: product._id, cantidad: { $gte: cantidad } },
        { $inc: { deposito: cantidad, cantidad: -cantidad } },
        { new: true, session }
      );
    }

    if (!actualizado) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `En salón solo hay ${disponible} unidad(es) de "${product.nombre}".`,
      });
    }

    await registrarMovimiento({
      producto: actualizado,
      talle,
      color,
      tipo: 'retiro_deposito',
      cantidad,
      empleado: req.user?.nombre,
    }, session);

    await session.commitTransaction();
    res.json(actualizado);
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session.endSession();
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
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${cargarVariant.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`,
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
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${productoCargado.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`,
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
      const empleado = req.user.nombre;
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
    await session.abortTransaction().catch(() => {});
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
              deposito: v.deposito || 0,
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
          deposito: product.deposito || 0,
          stockMinimo,
        });
      }
    }

    res.json(lowStock.sort((a, b) => a.cantidad - b.cantidad));
  } catch (error) {
    next(error);
  }
};