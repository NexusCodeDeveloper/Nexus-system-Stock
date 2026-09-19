import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const respaldar = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `repair-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['productos', 'ventas', 'devoluciones', 'movimientosStock', 'cierresCaja']) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
  }
  console.log(`Backup guardado en ${dir}`);
};

const recalcularCierre = async (db, cierre) => {
  if (!cierre.desde || !cierre.hasta) return null;

  const ventas = await db.collection('ventas')
    .find({ fechaCreacion: { $gte: cierre.desde, $lt: cierre.hasta } })
    .toArray();

  let total = 0;
  let cantidad = 0;
  const porMetodo = {};

  for (const s of ventas) {
    if (s.estado === 'devuelta') continue;
    total += s.total || 0;

    const tieneItems = Array.isArray(s.articulos) && s.articulos.length > 0;
    const articulos = tieneItems
      ? s.articulos
      : [{ producto: s.producto, cantidad: s.cantidad, precio: s.precio, subtotal: s.total }];
    let unidadesNetas = articulos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    if (!tieneItems) unidadesNetas = Math.max(0, unidadesNetas - (s.cantidadDevuelta || 0));
    cantidad += unidadesNetas;
    if (unidadesNetas <= 0) continue;

    const pagos = Array.isArray(s.pagos) && s.pagos.length > 0 ? s.pagos : null;
    if (pagos) {
      const totalPagado = pagos.reduce((a, p) => a + (p.monto || 0), 0);
      if (totalPagado <= 0) continue;
      let asignadas = 0;
      for (let i = 0; i < pagos.length; i++) {
        const p = pagos[i];
        if (!porMetodo[p.metodo]) porMetodo[p.metodo] = { total: 0, cantidad: 0 };
        porMetodo[p.metodo].total += p.monto || 0;
        const parte = i === pagos.length - 1
          ? unidadesNetas - asignadas
          : Math.round(unidadesNetas * ((p.monto || 0) / totalPagado));
        porMetodo[p.metodo].cantidad += parte;
        asignadas += parte;
      }
    } else {
      const m = s.metodoPago || 'efectivo';
      if (!porMetodo[m]) porMetodo[m] = { total: 0, cantidad: 0 };
      porMetodo[m].total += s.total || 0;
      porMetodo[m].cantidad += unidadesNetas;
    }
  }

  const retiros = await db.collection('retirosCaja')
    .find({ fechaCreacion: { $gte: cierre.desde, $lt: cierre.hasta } })
    .sort({ fechaCreacion: 1 })
    .toArray();
  const totalRetiros = retiros.reduce((a, r) => a + (r.monto || 0), 0);

  const devoluciones = await db.collection('devoluciones')
    .find({ fechaCreacion: { $gte: cierre.desde, $lt: cierre.hasta } })
    .toArray();
  const totalDevoluciones = devoluciones.reduce((a, r) => a + (r.montoDevuelto || 0), 0);
  const efectivoDevuelto = devoluciones.reduce((a, r) => a + (r.efectivoDevuelto || 0), 0);

  return {
    total,
    cantidad,
    efectivo: porMetodo.efectivo || { total: 0, cantidad: 0 },
    transferencia: porMetodo.transferencia || { total: 0, cantidad: 0 },
    tarjeta: porMetodo.tarjeta || { total: 0, cantidad: 0 },
    retiros: retiros.map((r) => ({
      monto: r.monto,
      motivo: r.motivo,
      realizadoPor: r.realizadoPor,
      fecha: r.fechaCreacion,
    })),
    totalRetiros,
    totalDevoluciones,
    efectivoDevuelto,
  };
};

const firmaCierre = (o) =>
  JSON.stringify([
    o.total,
    o.cantidad,
    o.efectivo?.total,
    o.efectivo?.cantidad,
    o.transferencia?.total,
    o.transferencia?.cantidad,
    o.tarjeta?.total,
    o.tarjeta?.cantidad,
    o.totalRetiros || 0,
    o.totalDevoluciones || 0,
    o.efectivoDevuelto || 0,
    (o.retiros || []).map((r) => [
      r.monto,
      r.motivo,
      r.realizadoPor,
      r.fecha instanceof Date ? r.fecha.toISOString() : r.fecha,
    ]),
  ]);

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const ventas = db.collection('ventas');
  const productos = db.collection('productos');
  const devoluciones = db.collection('devoluciones');
  const movimientos = db.collection('movimientosStock');
  const cierres = db.collection('cierresCaja');

  console.log(APPLY ? 'MODO APPLY: se modificarán los datos' : 'MODO DRY-RUN: no se modifica nada');
  if (APPLY) await respaldar(db);

  const resumen = { ventasReconstruidas: 0, ventasLegacy: 0, ventasRevisar: 0, depositoVarado: 0, cantidadSincronizada: 0, cierresCorregidos: 0, cierresRevisar: 0 };

  // 1) Ventas activas corruptas (articulos vacío + total 0) con una sola devolución reconstruible.
  //    Va PRIMERO para que la migración legacy no las capture con subtotal 0.
  const corruptas = await ventas
    .find({
      estado: { $ne: 'devuelta' },
      total: 0,
      $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }],
    })
    .toArray();

  for (const venta of corruptas) {
    const devoluciones = await devoluciones.find({ venta: venta._id }).toArray();
    const conSnapshot = devoluciones.filter((r) => r.precioUnitario > 0);
    if (devoluciones.length !== 1 || conSnapshot.length !== 1) {
      resumen.ventasRevisar++;
      console.log(`[revisar] Venta ${venta.ticketNumero || venta._id}: articulos vacío y ${devoluciones.length} devolución(es); no se puede reconstruir automáticamente.`);
      continue;
    }
    const r = conSnapshot[0];
    const producto = await productos.findOne({ _id: r.producto });
    const precio = r.precioUnitario;
    const articulo = {
      producto: r.producto,
      cantidad: r.cantidad,
      precio,
      talle: r.talle || '',
      color: r.color || '',
      subtotal: Math.round(precio * r.cantidad),
    };
    const factor = 1 - (venta.descuento || 0) / 100;
    const total = Math.round(articulo.subtotal * factor);
    const pagos = (r.pagosOriginales || []).filter((p) => (p.monto || 0) > 0);
    const pagosFinal = pagos.length > 0
      ? pagos
      : [{ metodo: venta.metodoPago || 'efectivo', monto: total }];
    if (APPLY) {
      await ventas.updateOne(
        { _id: venta._id },
        {
          $set: {
            articulos: [item],
            total,
            pagos: pagosFinal,
            estado: 'activa',
            producto: r.producto,
            cantidad: r.cantidad,
            precio,
            talle: r.talle || '',
          },
        }
      );
    }
    resumen.ventasReconstruidas++;
    console.log(`[ok] Venta ${venta.ticketNumero || venta._id} reconstruida con ${producto?.nombre || 'producto'} x${r.cantidad} ($${total / 100}).`);
  }

  // 2) Ventas legacy sin articulos[] (con total > 0) -> completar desde los campos viejos
  const legacy = await ventas
    .find({
      $or: [{ articulos: { $exists: false } }, { articulos: { $size: 0 } }],
      producto: { $exists: true, $ne: null },
      total: { $gt: 0 },
    })
    .toArray();
  for (const venta of legacy) {
    if (!venta.precio || !venta.cantidad) {
      resumen.ventasRevisar++;
      console.log(`[revisar] Venta ${venta.ticketNumero || venta._id}: legacy sin precio/cantidad, no se puede migrar.`);
      continue;
    }
    const articulo = {
      producto: venta.producto,
      cantidad: venta.cantidad,
      precio: venta.precio,
      talle: venta.talle || '',
      color: '',
      subtotal: Math.round(venta.precio * venta.cantidad),
    };
    if (APPLY) {
      await ventas.updateOne({ _id: venta._id }, { $set: { articulos: [item] } });
    }
    resumen.ventasLegacy++;
  }

  // 3) Productos con depósito raíz varado (variantes + deposito > 0) -> mover a la primera variante
  const varados = await productos.find({ 'variantes.0': { $exists: true }, deposito: { $gt: 0 } }).toArray();
  for (const producto of varados) {
    const destino = producto.variantes[0];
    const nuevoDeposito = (destino.deposito || 0) + producto.deposito;
    if (APPLY) {
      const session = await mongoose.connection.startSession();
      try {
        session.startTransaction();
        await productos.updateOne(
          { _id: producto._id },
          { $set: { 'variantes.0.deposito': nuevoDeposito, deposito: 0 } },
          { session }
        );
        await movimientos.insertOne({
          producto: producto._id,
          productoNombre: producto.nombre,
          talle: destino.talle || '',
          color: destino.color || '',
          tipo: 'ajuste_deposito',
          cantidad: producto.deposito,
          empleado: 'Reparación automática',
          fechaCreacion: new Date(),
          fechaActualizacion: new Date(),
        }, { session });
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction().catch(() => {});
        throw error;
      } finally {
        await session.endSession();
      }
    }
    resumen.depositoVarado++;
    console.log(`[ok] "${producto.nombre}": ${producto.deposito} unidad(es) movidas del depósito raíz a la variante ${[destino.talle, destino.color].filter(Boolean).join(' / ') || 'base'}.`);
  }

  // 4) cantidad inconsistente con la suma de variantes -> sincronizar
  const conVariantes = await productos.find({ 'variantes.0': { $exists: true } }).toArray();
  for (const producto of conVariantes) {
    const suma = (producto.variantes || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    if ((producto.cantidad || 0) !== suma) {
      if (APPLY) {
        await productos.updateOne({ _id: producto._id }, { $set: { cantidad: suma } });
      }
      resumen.cantidadSincronizada++;
      console.log(`[ok] "${producto.nombre}": salón ${producto.cantidad} -> ${suma} (suma de variantes).`);
    }
  }

  // 5) Cierres con montos mal convertidos (×100) -> recalcular desde ventas, retiros y devoluciones
  const todosCierres = await cierres.find({}).toArray();
  for (const cierre of todosCierres) {
    const calculo = await recalcularCierre(db, cierre);
    if (!calculo) {
      resumen.cierresRevisar++;
      console.log(`[revisar] Cierre ${cierre._id}: sin ventana (desde/hasta), no se puede recalcular.`);
      continue;
    }
    if (firmaCierre(cierre) === firmaCierre(calculo)) continue;

    if (APPLY) {
      await cierres.updateOne({ _id: cierre._id }, { $set: calculo });
    }
    resumen.cierresCorregidos++;
    const fecha = new Date(cierre.fecha).toLocaleDateString('es-AR');
    console.log(
      `[ok] Cierre ${cierre.turno || 'legacy'} del ${fecha}: total ${cierre.total} -> ${calculo.total} centavos` +
        ` (efectivo ${cierre.efectivo?.total || 0} -> ${calculo.efectivo.total}, retiros ${cierre.totalRetiros || 0} -> ${calculo.totalRetiros}).`
    );
  }

  console.log('\nResumen:', JSON.stringify(resumen, null, 2));
  console.log(
    resumen.ventasRevisar + resumen.cierresRevisar > 0
      ? 'Hay datos que requieren revisión manual (se listaron arriba).'
      : 'No quedaron datos pendientes de revisión.'
  );
  if (!APPLY) console.log('Dry-run finalizado. Para aplicar: node scripts/reparar-datos.js --apply');
};

run()
  .catch((error) => {
    console.error('Error en la reparación:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
