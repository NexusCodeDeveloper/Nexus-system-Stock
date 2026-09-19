import mongoose from 'mongoose';
import Product from './ProductModel.js';
import Return from '../Return/ReturnModel.js';
import Sale from '../Sale/SaleModel.js';
import Supplier from '../Supplier/SupplierModel.js';
import Counter from '../Sale/CounterModel.js';
import StockMovement from '../StockMovement/StockMovementModel.js';
import { guardarConTicketUnico, registrarDevolucionEnVenta } from '../Sale/ticketUtils.js';
import { createProductSchema, updateProductSchema, exchangeSchema, addStockSchema, movimientoStockSchema, depositoSchema, pasarSalonSchema } from './ProductSchema.js';
import { enviarEvento, enviarStockBajo } from '../../services/pushService.js';
import { findVariant, findVariantIdx, depositoDe } from '../../utils/variantes.js';
import { getItems, mismaLinea, prorratearPagos, esMismoDia } from '../../utils/ventas.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/caja.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const claveVariante = (talle, color) =>
  `${String(talle ?? '').trim().toLowerCase()}|${String(color ?? '').trim().toLowerCase()}`;

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

    const limite = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 2000);
    const products = await Product.find(filter).sort({ nombre: 1 }).limit(limite);

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

    if (data.variants?.length > 0 && ((data.cantidad || 0) > 0 || (data.deposito || 0) > 0)) {
      return res.status(400).json({
        message: 'Cuando el producto tiene variantes, el stock se carga por variante (depósito). No envíes cantidad/depósito generales para no perder unidades.',
      });
    }

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
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = updateProductSchema.parse(req.body);
    const product = await Product.findById(req.params.id).session(session);

    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (data.nombre) {
      const existing = await Product.findOne({
        nombre: { $regex: `^${escapeRegex(data.nombre)}$`, $options: 'i' },
        _id: { $ne: product._id },
      }).session(session);
      if (existing) {
        await session.abortTransaction();
        return res.status(409).json({ message: `Ya existe un producto llamado "${data.nombre}"` });
      }
    }

    const movimientos = [];
    const variantesPrevias = (product.variants || []).map((v) => ({
      talle: v.talle || '',
      color: v.color || '',
      cantidad: v.cantidad || 0,
      deposito: v.deposito || 0,
    }));

    if (data.variants) {
      const faltantes = variantesPrevias.filter(
        (prev) =>
          (prev.cantidad > 0 || prev.deposito > 0) &&
          !data.variants.some(
            (v) => claveVariante(v.talle, v.color) === claveVariante(prev.talle, prev.color)
          )
      );
      if (faltantes.length > 0) {
        const detalle = faltantes
          .map((v) => `${[v.talle, v.color].filter(Boolean).join(' / ') || 'Base'} (salón ${v.cantidad} · dep ${v.deposito})`)
          .join(', ');
        await session.abortTransaction();
        return res.status(409).json({
          message: `No se pueden quitar ni renombrar variantes con stock: ${detalle}. Pasá o ajustá el stock primero.`,
        });
      }

      if (data.variants.length > 0) {
        if (variantesPrevias.length === 0 && ((product.cantidad || 0) > 0 || (product.deposito || 0) > 0)) {
          const detalle = [
            (product.cantidad || 0) > 0 ? `${product.cantidad} en salón` : null,
            (product.deposito || 0) > 0 ? `${product.deposito} en depósito` : null,
          ]
            .filter(Boolean)
            .join(' y ');
          await session.abortTransaction();
          return res.status(409).json({
            message: `"${product.nombre}" tiene ${detalle} sin variante. Pasá o ajustá ese stock antes de agregar colores para no perder unidades.`,
          });
        }

        if (data.colores?.length) {
          const colorInvalido = data.variants.find(
            (v) => v.color && !data.colores.includes(v.color)
          );
          if (colorInvalido) {
            await session.abortTransaction();
            return res.status(400).json({
              message: `El color "${colorInvalido.color}" no está en la lista de colores del producto`,
            });
          }
        } else if (product.colores?.length) {
          const colorInvalido = data.variants.find(
            (v) => v.color && !product.colores.includes(v.color)
          );
          if (colorInvalido) {
            await session.abortTransaction();
            return res.status(400).json({
              message: `El color "${colorInvalido.color}" no está en la lista de colores del producto`,
            });
          }
        }

        delete data.deposito;

        data.variants = data.variants.map((v) => {
          const idx = findVariantIdx(product, v.talle, v.color);
          const depositoNuevo = Number(v.deposito) || 0;
          if (idx === -1) {
            if (depositoNuevo > 0) {
              movimientos.push({ talle: v.talle || '', color: v.color || '', tipo: 'ingreso_deposito', cantidad: depositoNuevo });
            }
            return { ...v, cantidad: 0, deposito: depositoNuevo };
          }
          const prev = product.variants[idx];
          const delta = depositoNuevo - (prev.deposito || 0);
          if (delta !== 0) {
            movimientos.push({ talle: v.talle || '', color: v.color || '', tipo: 'ajuste_deposito', cantidad: Math.abs(delta) });
          }
          return { ...v, cantidad: prev.cantidad || 0, deposito: depositoNuevo };
        });
      } else {
        const depositoPrevio = variantesPrevias.length > 0
          ? variantesPrevias.reduce((s, v) => s + v.deposito, 0)
          : (product.deposito || 0);
        const depositoNuevo = Number(data.deposito) || 0;
        if (depositoPrevio !== depositoNuevo) {
          movimientos.push({ talle: '', color: '', tipo: 'ajuste_deposito', cantidad: Math.abs(depositoNuevo - depositoPrevio) });
        }
        data.variants = [];
      }
    } else if (data.deposito != null) {
      if (variantesPrevias.length > 0) {
        delete data.deposito;
      } else {
        const delta = (Number(data.deposito) || 0) - (product.deposito || 0);
        if (delta !== 0) {
          movimientos.push({ talle: '', color: '', tipo: 'ajuste_deposito', cantidad: Math.abs(delta) });
        }
      }
    }

    Object.assign(product, data);
    await product.save({ session });

    for (const movimiento of movimientos) {
      await registrarMovimiento({
        producto: product,
        ...movimiento,
        empleado: req.user?.nombre,
      }, session);
    }

    await session.commitTransaction();
    res.json(product);
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const addStock = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const addDeposito = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const reponerStock = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
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
      const variante = product.variants[idx];
      actualizado = await Product.findOneAndUpdate(
        {
          _id: product._id,
          variants: { $elemMatch: { talle: variante.talle || '', color: variante.color || '', deposito: { $gte: cantidad } } },
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const pasarAlSalon = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const { items } = pasarSalonSchema.parse(req.body);

    const ids = [...new Set(items.map((i) => String(i.producto)))];
    const productos = await Product.find({ _id: { $in: ids } }).session(session);
    const porId = new Map(productos.map((p) => [String(p._id), p]));
    const movimientos = [];

    for (const item of items) {
      const product = porId.get(String(item.producto));
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.producto} no encontrado` });
      }
      const disponible = depositoDe(product, item.talle, item.color);
      if (disponible < item.cantidad) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `En depósito solo hay ${disponible} unidad(es) de "${product.nombre}". No se movió nada.`,
        });
      }
      if (product.variants?.length > 0) {
        const idx = findVariantIdx(product, item.talle, item.color);
        if (idx === -1) {
          await session.abortTransaction();
          return res.status(400).json({ message: `Variante no encontrada en "${product.nombre}"` });
        }
        product.variants[idx].deposito -= item.cantidad;
        product.variants[idx].cantidad += item.cantidad;
      } else {
        product.deposito -= item.cantidad;
        product.cantidad += item.cantidad;
      }
      movimientos.push({ producto: product, talle: item.talle, color: item.color, cantidad: item.cantidad });
    }

    for (const product of porId.values()) {
      await product.save({ session });
    }
    for (const movimiento of movimientos) {
      await registrarMovimiento({
        producto: movimiento.producto,
        talle: movimiento.talle,
        color: movimiento.color,
        tipo: 'reposicion',
        cantidad: movimiento.cantidad,
        empleado: req.user?.nombre,
      }, session);
    }

    await session.commitTransaction();
    res.json({ message: 'Stock pasado al salón' });
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const retirarStock = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
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
      const variante = product.variants[idx];
      actualizado = await Product.findOneAndUpdate(
        {
          _id: product._id,
          variants: { $elemMatch: { talle: variante.talle || '', color: variante.color || '', cantidad: { $gte: cantidad } } },
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const exchangeProduct = async (req, res, next) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const data = exchangeSchema.parse(req.body);

    const caja = await buscarCajaAbierta(session);
    if (!caja) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Antes de hacer un cambio tenés que abrir la caja', code: 'SIN_CAJA' });
    }
    if (!cajaEsDeHoy(caja, Number(data.offset) || 0)) {
      await session.abortTransaction();
      return res.status(409).json({ message: mensajeCajaAnterior(caja), code: 'CAJA_DIA_ANTERIOR' });
    }

    const mismoProducto = String(data.productoDevolver) === String(data.productoCargar);
    const productoDevuelto = await Product.findById(data.productoDevolver).session(session);
    if (!productoDevuelto) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto a devolver no encontrado' });
    }

    const productoCargado = mismoProducto
      ? productoDevuelto
      : await Product.findById(data.productoCargar).session(session);
    if (!productoCargado) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Producto a cargar no encontrado' });
    }

    const normalizarVariante = (v) => String(v ?? '').trim().toLowerCase();
    const mismaVariante = mismoProducto
      && normalizarVariante(data.talleDevolver) === normalizarVariante(data.talleCargar)
      && normalizarVariante(data.colorDevolver) === normalizarVariante(data.colorCargar);

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
      const stockDisponible = cargarVariant.cantidad + (mismaVariante ? data.cantidadDevolver : 0);
      if (stockDisponible < data.cantidadCargar) {
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${cargarVariant.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`,
        });
      }
    } else {
      const stockDisponible = productoCargado.cantidad + (mismoProducto ? data.cantidadDevolver : 0);
      if (stockDisponible < data.cantidadCargar) {
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${productoCargado.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`,
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
      if (!saleTicket.items || saleTicket.items.length === 0) {
        saleTicket.items = getItems(saleTicket);
      }
      const match = saleTicket.items.find((i) => mismaLinea(i, {
        producto: data.productoDevolver,
        talle: data.talleDevolver,
        color: data.colorDevolver,
      }));
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
      productoCargado.cantidad -= data.cantidadCargar;
    }

    await productoDevuelto.save({ session });
    if (productoCargado !== productoDevuelto) {
      await productoCargado.save({ session });
    }

    const linea = { producto: data.productoDevolver, talle: data.talleDevolver, color: data.colorDevolver };
    const esLineaDevuelta = (i) => mismaLinea(i, linea);

    if (saleTicket && (!saleTicket.items || saleTicket.items.length === 0)) {
      saleTicket.items = getItems(saleTicket);
    }

    const precioDevuelto = saleTicket
      ? (saleTicket.items?.find(esLineaDevuelta)?.precio ?? productoDevuelto.precio)
      : productoDevuelto.precio;
    const factorDescuentoTicket = 1 - (saleTicket?.descuento || 0) / 100;
    const devolverValor = Math.round(precioDevuelto * data.cantidadDevolver * factorDescuentoTicket * 100) / 100;
    const cargarValor = Math.round(productoCargado.precio * data.cantidadCargar * 100) / 100;
    const diferencia = Math.round((cargarValor - devolverValor) * 100) / 100;

    let pendiente = data.cantidadDevolver;
    let saleConsumida = null;
    let montoTotalDevuelto = 0;
    let precioUnitarioSnapshot = precioDevuelto;
    let descuentoAplicado = saleTicket?.descuento || 0;
    let pagosOriginales = [];
    let pagosAntes = [];
    const sales = saleTicket ? [saleTicket] : [];

    for (const sale of sales) {
      if (pendiente <= 0) break;
      saleConsumida = sale._id;

      const match = sale.items?.find(esLineaDevuelta);
      const saleCantidad = match?.cantidad ?? sale.cantidad ?? 0;
      const precioUnit = match?.precio ?? sale.precio ?? 0;
      const factorDescuento = 1 - (sale.descuento || 0) / 100;
      precioUnitarioSnapshot = precioUnit;
      descuentoAplicado = sale.descuento || 0;

      if (saleCantidad <= pendiente) {
        pendiente -= saleCantidad;
        const montoDevuelto = Math.round(precioUnit * saleCantidad * factorDescuento * 100) / 100;
        montoTotalDevuelto = Math.round((montoTotalDevuelto + montoDevuelto) * 100) / 100;
        const restantes = (sale.items || []).filter((i) => !esLineaDevuelta(i));
        if (restantes.length > 0) {
          sale.items = restantes;
          const primerItem = sale.items[0];
          sale.producto = primerItem.producto;
          sale.cantidad = primerItem.cantidad;
          sale.precio = primerItem.precio;
          sale.talle = primerItem.talle || '';
          sale.total = Math.round(sale.items.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) * (1 - (sale.descuento || 0) / 100) * 100) / 100;
          pagosAntes = (sale.pagos || []).map((p) => ({ metodo: p.metodo, monto: Math.round(p.monto * 100) / 100 }));
        } else {
          pagosOriginales = (sale.pagos || []).map((p) => ({ metodo: p.metodo, monto: Math.round(p.monto * 100) / 100 }));
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
          match.subtotal = Math.round(match.precio * match.cantidad * 100) / 100;
        }
        const sumSubtotales = (sale.items || []).reduce(
          (s, i) => s + (i.subtotal ?? i.precio * i.cantidad),
          0
        );
        sale.total = Math.round(sumSubtotales * (1 - (sale.descuento || 0) / 100) * 100) / 100;
        const montoDevuelto = Math.round(precioUnit * pendiente * factorDescuento * 100) / 100;
        montoTotalDevuelto = Math.round((montoTotalDevuelto + montoDevuelto) * 100) / 100;
        pagosAntes = (sale.pagos || []).map((p) => ({ metodo: p.metodo, monto: Math.round(p.monto * 100) / 100 }));
        registrarDevolucionEnVenta(sale, { motivo: data.motivo, cantidad: pendiente, monto: montoDevuelto });
        await sale.save({ session });
        pendiente = 0;
      }
    }

    if (saleTicket && pendiente > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Solo se pueden devolver ${data.cantidadDevolver - pendiente} unidad(es): no hay más vendidas de este producto para cubrir el cambio`,
      });
    }

    const empleado = req.user.nombre;
    const offset = Number(data.offset) || 0;
    const metodo = data.metodoPago || saleTicket?.pagos?.[0]?.metodo || 'efectivo';
    const mismoDiaTicket = Boolean(saleTicket) && esMismoDia(saleTicket.createdAt, offset);

    let ventaDiferencia = null;
    let efectivoDevuelto = 0;

    if (mismoDiaTicket) {
      let pagosNuevaVenta = prorratearPagos(pagosAntes, montoTotalDevuelto);
      if (diferencia > 0) {
        pagosNuevaVenta.push({ metodo, monto: diferencia });
      } else if (diferencia < 0) {
        let restante = Math.abs(diferencia);
        const orden = [metodo, ...pagosNuevaVenta.map((p) => p.metodo).filter((m) => m !== metodo)];
        for (const m of orden) {
          if (restante <= 0) break;
          const idx = pagosNuevaVenta.findIndex((p) => p.metodo === m);
          if (idx === -1) continue;
          const quitar = Math.min(pagosNuevaVenta[idx].monto, restante);
          pagosNuevaVenta[idx].monto = Math.round((pagosNuevaVenta[idx].monto - quitar) * 100) / 100;
          restante = Math.round((restante - quitar) * 100) / 100;
        }
        pagosNuevaVenta = pagosNuevaVenta.filter((p) => p.monto > 0);
      }
      if (pagosNuevaVenta.length === 0) {
        pagosNuevaVenta = [{ metodo, monto: cargarValor }];
      }
      const sumaPagos = Math.round(pagosNuevaVenta.reduce((s, p) => s + p.monto, 0) * 100) / 100;
      const ajuste = Math.round((cargarValor - sumaPagos) * 100) / 100;
      if (ajuste !== 0) {
        const ultimo = pagosNuevaVenta[pagosNuevaVenta.length - 1];
        ultimo.monto = Math.round((ultimo.monto + ajuste) * 100) / 100;
        if (ultimo.monto <= 0) {
          await session.abortTransaction();
          return res.status(400).json({ message: 'No se pudo distribuir el pago del cambio' });
        }
      }
      ventaDiferencia = await Sale.create([{
        items: [{
          producto: data.productoCargar,
          cantidad: data.cantidadCargar,
          precio: productoCargado.precio,
          talle: data.talleCargar || '',
          color: data.colorCargar || '',
          subtotal: cargarValor,
        }],
        total: cargarValor,
        empleado,
        pagos: pagosNuevaVenta,
        descuento: 0,
      }], { session });
      await guardarConTicketUnico(ventaDiferencia[0], session);
    } else if (diferencia > 0) {
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
    } else if (diferencia < 0 && metodo === 'efectivo') {
      efectivoDevuelto = Math.abs(diferencia);
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
      efectivoDevuelto,
      precioUnitario: precioUnitarioSnapshot,
      descuentoAplicado,
      pagosOriginales,
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
    await session?.abortTransaction().catch(() => {});
    next(error);
  } finally {
    session?.endSession();
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const [ventas, devoluciones, movimientos] = await Promise.all([
      Sale.countDocuments({ $or: [{ 'items.producto': product._id }, { producto: product._id }] }),
      Return.countDocuments({ $or: [{ producto: product._id }, { productoCargar: product._id }] }),
      StockMovement.countDocuments({ producto: product._id }),
    ]);

    if (ventas > 0 || devoluciones > 0 || movimientos > 0) {
      return res.status(409).json({
        message: `No se puede eliminar "${product.nombre}": tiene ${ventas} venta(s), ${devoluciones} devolución(es) y ${movimientos} movimiento(s) asociados. El historial quedaría huérfano.`,
      });
    }

    await Product.findByIdAndDelete(product._id);
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