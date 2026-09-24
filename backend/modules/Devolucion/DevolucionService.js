import mongoose from 'mongoose';
import Devolucion from './DevolucionModel.js';
import Producto from '../Producto/ProductoModel.js';
import Venta from '../Venta/VentaModel.js';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta, guardarConTicketUnico } from '../Venta/TicketUtils.js';
import { indiceDeVariante, encontrarVariante, depositoDe } from '../../utils/VariantesUtils.js';
import { obtenerArticulos, mismaLinea, prorratearPagos, totalEfectivoDePagos, esMismoDia } from '../../utils/VentasUtils.js';
import { mensajeCierre, verificarOperacionNoEnCierre, MENSAJE_CIERRE_EN_CURSO } from '../../utils/CierresUtils.js';
import { buscarCajaAbierta, cajaEsDeHoy, mensajeCajaAnterior } from '../../utils/CajaUtils.js';

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const errorDeServicio = (statusCode, message, codigo) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (codigo) error.codigo = codigo;
  return error;
};

const pagosDe = (venta) => (venta?.pagos || []).map((p) => ({ metodo: p.metodo, monto: redondear(p.monto) }));

const materializarItems = (venta) => {
  if (!venta.articulos || venta.articulos.length === 0) {
    venta.articulos = obtenerArticulos(venta);
  }
  return venta.articulos;
};

const unidadesDisponiblesEnTicket = (venta, linea) =>
  (venta.articulos || [])
    .filter((i) => mismaLinea(i, linea))
    .reduce((s, i) => s + (Number(i.cantidad) || 0), 0);

export const aplicarDevolucionAlTicket = (venta, linea, cantidad, motivo) => {
  const pagosOriginales = pagosDe(venta);
  const factorDescuento = 1 - (venta.descuento || 0) / 100;
  let pendiente = cantidad;
  let montoTotal = 0;
  let precioUnitario = 0;

  while (pendiente > 0) {
    const idx = (venta.articulos || []).findIndex((i) => mismaLinea(i, linea));
    if (idx === -1) break;

    const match = venta.articulos[idx];
    const consumir = Math.min(match.cantidad, pendiente);
    precioUnitario = match.precio;
    const monto = redondear(match.precio * consumir * factorDescuento);
    montoTotal = redondear(montoTotal + monto);
    pendiente -= consumir;

    if (consumir >= match.cantidad) {
      venta.articulos.splice(idx, 1);
    } else {
      match.cantidad -= consumir;
      match.subtotal = redondear(match.precio * match.cantidad);
    }

    registrarDevolucionEnVenta(venta, { motivo, cantidad: consumir, monto });
  }

  if (pendiente > 0) {
    return { error: `Solo hay ${cantidad - pendiente} unidad(es) de este producto en el ticket` };
  }

  if (venta.articulos.length === 0) {
    venta.total = 0;
    venta.pagos = [];
    venta.estado = 'devuelta';
  } else {
    venta.total = redondear(
      venta.articulos.reduce((s, i) => s + (i.subtotal ?? i.precio * i.cantidad), 0) * factorDescuento
    );
  }

  return {
    montoDevuelto: montoTotal,
    precioUnitario,
    pagosOriginales,
    descuentoAplicado: venta.descuento || 0,
  };
};

const verificarCajaAbierta = async (session, offset, contexto) => {
  const caja = await buscarCajaAbierta(session);
  if (!caja) {
    throw errorDeServicio(409, `Antes de ${contexto} tenés que abrir la caja`, 'SIN_CAJA');
  }
  if (!cajaEsDeHoy(caja, offset)) {
    throw errorDeServicio(409, mensajeCajaAnterior(caja), 'CAJA_DIA_ANTERIOR');
  }
};

export const ejecutarDevolucion = async (data, usuario) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const offset = Number(data.offset) || 0;

    await verificarCajaAbierta(session, offset, 'registrar una devolución');

    const product = await Producto.findById(data.producto).session(session);
    if (!product) throw errorDeServicio(404, 'Producto no encontrado');

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

    let sale = null;
    if (data.venta) {
      sale = await Venta.findById(data.venta).session(session);
      if (!sale) throw errorDeServicio(400, 'El ticket no existe o ya fue devuelto');
      if (sale.estado === 'devuelta') throw errorDeServicio(400, 'El ticket ya fue devuelto');
      materializarItems(sale);
      const linea = { producto: data.producto, talle: data.talle, color: data.color };
      const disponible = unidadesDisponiblesEnTicket(sale, linea);
      if (disponible < data.cantidad) {
        throw errorDeServicio(400, `Solo hay ${disponible} unidad(es) de este producto en el ticket`);
      }
    }

    let montoTotalDevuelto = redondear((product.precio || 0) * data.cantidad);
    let precioUnitario = product.precio || 0;
    let descuentoAplicado = 0;
    let pagosOriginales = [];

    if (sale) {
      const resultado = aplicarDevolucionAlTicket(
        sale,
        { producto: data.producto, talle: data.talle, color: data.color },
        data.cantidad,
        data.motivo
      );
      if (resultado.error) throw errorDeServicio(400, resultado.error);
      montoTotalDevuelto = resultado.montoDevuelto;
      precioUnitario = resultado.precioUnitario;
      descuentoAplicado = resultado.descuentoAplicado;
      pagosOriginales = resultado.pagosOriginales;
      await sale.save({ session });
    }

    let efectivoDevuelto = 0;
    if (!sale) {
      efectivoDevuelto = montoTotalDevuelto;
    } else if (!esMismoDia(sale.fechaCreacion, offset)) {
      efectivoDevuelto = pagosOriginales.length > 0
        ? totalEfectivoDePagos(prorratearPagos(pagosOriginales, montoTotalDevuelto))
        : (sale.metodoPago === 'efectivo' || !sale.metodoPago ? montoTotalDevuelto : 0);
    }

    const returnRecord = await Devolucion.create([{
      ...data,
      venta: data.venta || null,
      diferencia: 0,
      montoDevuelto: montoTotalDevuelto,
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
    return { devolucion: populated, venta: sale, usuario };
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
};

export const ejecutarCambio = async (data, usuario) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const offset = Number(data.offset) || 0;

    await verificarCajaAbierta(session, offset, 'hacer un cambio');

    const mismoProducto = String(data.productoDevolver) === String(data.productoCargar);
    const productoDevuelto = await Producto.findById(data.productoDevolver).session(session);
    if (!productoDevuelto) throw errorDeServicio(404, 'Producto a devolver no encontrado');

    const productoCargado = mismoProducto
      ? productoDevuelto
      : await Producto.findById(data.productoCargar).session(session);
    if (!productoCargado) throw errorDeServicio(404, 'Producto a cargar no encontrado');

    const normalizarVariante = (v) => String(v ?? '').trim().toLowerCase();
    const mismaVariante = mismoProducto
      && normalizarVariante(data.talleDevolver) === normalizarVariante(data.talleCargar)
      && normalizarVariante(data.colorDevolver) === normalizarVariante(data.colorCargar);

    if (productoDevuelto.variantes?.length > 0) {
      const devolverVariant = encontrarVariante(productoDevuelto, data.talleDevolver, data.colorDevolver);
      if (!devolverVariant) {
        throw errorDeServicio(400, `Variante no encontrada en "${productoDevuelto.nombre}" a devolver`);
      }
    }

    if (productoCargado.variantes?.length > 0) {
      const cargarVariant = encontrarVariante(productoCargado, data.talleCargar, data.colorCargar);
      if (!cargarVariant) {
        throw errorDeServicio(400, `Variante no encontrada en "${productoCargado.nombre}" a cargar`);
      }
      const stockDisponible = cargarVariant.cantidad + (mismaVariante ? data.cantidadDevolver : 0);
      if (stockDisponible < data.cantidadCargar) {
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        throw errorDeServicio(
          400,
          `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${cargarVariant.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`
        );
      }
    } else {
      const stockDisponible = productoCargado.cantidad + (mismoProducto ? data.cantidadDevolver : 0);
      if (stockDisponible < data.cantidadCargar) {
        const enDeposito = depositoDe(productoCargado, data.talleCargar, data.colorCargar);
        throw errorDeServicio(
          400,
          `Stock insuficiente de "${productoCargado.nombre}". Solo hay ${productoCargado.cantidad} unidad(es) en salón.${enDeposito > 0 ? ` Hay ${enDeposito} en depósito: reponé primero.` : ''}`
        );
      }
    }

    let saleTicket = null;
    if (data.venta) {
      saleTicket = await Venta.findById(data.venta).session(session);
      if (!saleTicket) throw errorDeServicio(400, 'El ticket no existe o ya fue devuelto');
      if (saleTicket.estado === 'devuelta') throw errorDeServicio(400, 'El ticket ya fue devuelto');
      materializarItems(saleTicket);
      const linea = { producto: data.productoDevolver, talle: data.talleDevolver, color: data.colorDevolver };
      const disponible = unidadesDisponiblesEnTicket(saleTicket, linea);
      if (disponible < data.cantidadDevolver) {
        throw errorDeServicio(400, `Solo hay ${disponible} unidad(es) de este producto en el ticket`);
      }
    }

    if (productoDevuelto.variantes?.length > 0) {
      const idx = indiceDeVariante(productoDevuelto, data.talleDevolver, data.colorDevolver);
      if (idx === -1) {
        productoDevuelto.variantes.push({ talle: data.talleDevolver || '', color: data.colorDevolver || '', cantidad: 0 });
      }
      productoDevuelto.variantes[idx === -1 ? productoDevuelto.variantes.length - 1 : idx].cantidad += data.cantidadDevolver;
    } else {
      productoDevuelto.cantidad += data.cantidadDevolver;
    }

    if (productoCargado.variantes?.length > 0) {
      const idx = indiceDeVariante(productoCargado, data.talleCargar, data.colorCargar);
      if (idx === -1) {
        productoCargado.variantes.push({ talle: data.talleCargar || '', color: data.colorCargar || '', cantidad: 0 });
      }
      productoCargado.variantes[idx === -1 ? productoCargado.variantes.length - 1 : idx].cantidad -= data.cantidadCargar;
    } else {
      productoCargado.cantidad -= data.cantidadCargar;
    }

    await productoDevuelto.save({ session });
    if (productoCargado !== productoDevuelto) {
      await productoCargado.save({ session });
    }

    const cargarValor = redondear(productoCargado.precio * data.cantidadCargar);
    let montoTotalDevuelto = redondear((productoDevuelto.precio || 0) * data.cantidadDevolver);
    let precioUnitarioSnapshot = productoDevuelto.precio || 0;
    let descuentoAplicado = 0;
    let pagosOriginales = [];

    if (saleTicket) {
      const resultado = aplicarDevolucionAlTicket(
        saleTicket,
        { producto: data.productoDevolver, talle: data.talleDevolver, color: data.colorDevolver },
        data.cantidadDevolver,
        data.motivo
      );
      if (resultado.error) throw errorDeServicio(400, resultado.error);
      montoTotalDevuelto = resultado.montoDevuelto;
      precioUnitarioSnapshot = resultado.precioUnitario;
      descuentoAplicado = resultado.descuentoAplicado;
      pagosOriginales = resultado.pagosOriginales;
      await saleTicket.save({ session });
    }

    const diferencia = redondear(cargarValor - montoTotalDevuelto);
    const metodo = data.metodoPago || pagosOriginales[0]?.metodo || saleTicket?.metodoPago || 'efectivo';
    const mismoDiaTicket = Boolean(saleTicket) && esMismoDia(saleTicket.fechaCreacion, offset);
    const empleado = usuario?.nombre || data.empleado || '';

    let ventaDiferencia = null;
    let efectivoDevuelto = 0;

    if (mismoDiaTicket) {
      let pagosNuevaVenta = prorratearPagos(pagosOriginales, montoTotalDevuelto);
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
          pagosNuevaVenta[idx].monto = redondear(pagosNuevaVenta[idx].monto - quitar);
          restante = redondear(restante - quitar);
        }
        pagosNuevaVenta = pagosNuevaVenta.filter((p) => p.monto > 0);
      }
      if (pagosNuevaVenta.length === 0) {
        pagosNuevaVenta = [{ metodo, monto: cargarValor }];
      }
      const sumaPagos = redondear(pagosNuevaVenta.reduce((s, p) => s + p.monto, 0));
      const ajuste = redondear(cargarValor - sumaPagos);
      if (ajuste !== 0) {
        const ultimo = pagosNuevaVenta[pagosNuevaVenta.length - 1];
        ultimo.monto = redondear(ultimo.monto + ajuste);
        if (ultimo.monto <= 0) {
          throw errorDeServicio(400, 'No se pudo distribuir el pago del cambio');
        }
      }
      ventaDiferencia = await Venta.create([{
        articulos: [{
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
    } else {
      const pagoDiferencia = Math.max(0, diferencia);
      ventaDiferencia = await Venta.create([{
        articulos: [{
          producto: data.productoCargar,
          cantidad: data.cantidadCargar,
          precio: productoCargado.precio,
          talle: data.talleCargar || '',
          color: data.colorCargar || '',
          subtotal: cargarValor,
        }],
        total: cargarValor,
        empleado,
        pagos: [{ metodo, monto: pagoDiferencia }],
        descuento: 0,
      }], { session });
      await guardarConTicketUnico(ventaDiferencia[0], session);
      if (diferencia < 0 && metodo === 'efectivo') {
        efectivoDevuelto = Math.abs(diferencia);
      }
    }

    await Devolucion.create([{
      producto: data.productoDevolver,
      cantidad: data.cantidadDevolver,
      talle: data.talleDevolver || '',
      color: data.colorDevolver || '',
      productoCargar: data.productoCargar,
      cantidadCargar: data.cantidadCargar,
      talleCargar: data.talleCargar || '',
      colorCargar: data.colorCargar || '',
      venta: data.venta || null,
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
    return {
      productoDevuelto,
      productoCargado,
      diferencia,
      montoTotalDevuelto,
      efectivoDevuelto,
      ventaDiferencia: ventaDiferencia ? ventaDiferencia[0] : null,
    };
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
};

export const revertirDevolucion = async (id) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const returnRecord = await Devolucion.findById(id).session(session);
    if (!returnRecord) throw errorDeServicio(404, 'Devolución no encontrada');

    const verificacion = await verificarOperacionNoEnCierre(returnRecord.fechaCreacion, session);
    if (verificacion.bloqueado) {
      throw errorDeServicio(
        409,
        verificacion.motivo === 'cerrando'
          ? MENSAJE_CIERRE_EN_CURSO
          : `No se puede eliminar una devolución que ya forma parte de un cierre.${mensajeCierre(verificacion.cierre)}`
      );
    }

    const mismoProducto = returnRecord.productoCargar
      && String(returnRecord.productoCargar) === String(returnRecord.producto);

    const product = await Producto.findById(returnRecord.producto).session(session);
    if (product) {
      if (product.variantes?.length > 0) {
        const idx = indiceDeVariante(product, returnRecord.talle, returnRecord.color);
        if (idx === -1) {
          throw errorDeServicio(
            409,
            `La variante "${[returnRecord.talle, returnRecord.color].filter(Boolean).join(' / ') || 'sin variante'}" ya no existe en "${product.nombre}". Revisá el stock antes de eliminar la devolución.`
          );
        }
        const disponible = product.variantes[idx].cantidad;
        if (disponible < returnRecord.cantidad) {
          throw errorDeServicio(
            409,
            `No se puede deshacer la devolución de "${product.nombre}": quedan ${disponible} unidad(es) y se necesitan ${returnRecord.cantidad}.`
          );
        }
        product.variantes[idx].cantidad -= returnRecord.cantidad;
      } else {
        if (product.cantidad < returnRecord.cantidad) {
          throw errorDeServicio(
            409,
            `No se puede deshacer la devolución de "${product.nombre}": quedan ${product.cantidad} unidad(es) y se necesitan ${returnRecord.cantidad}.`
          );
        }
        product.cantidad -= returnRecord.cantidad;
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

    await Devolucion.findByIdAndDelete(id).session(session);
    await session.commitTransaction();
    return returnRecord;
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    session.endSession();
  }
};
