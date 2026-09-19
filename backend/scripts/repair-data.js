import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const backup = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `repair-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['products', 'sales', 'returns', 'stockmovements', 'dailycloses']) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
  }
  console.log(`Backup guardado en ${dir}`);
};

const recalcularCierre = async (db, close) => {
  if (!close.desdeAt || !close.hastaAt) return null;

  const sales = await db.collection('sales')
    .find({ createdAt: { $gte: close.desdeAt, $lt: close.hastaAt } })
    .toArray();

  let total = 0;
  let cantidad = 0;
  const porMetodo = {};

  for (const s of sales) {
    if (s.estado === 'devuelta') continue;
    total += s.total || 0;

    const tieneItems = Array.isArray(s.items) && s.items.length > 0;
    const items = tieneItems
      ? s.items
      : [{ producto: s.producto, cantidad: s.cantidad, precio: s.precio, subtotal: s.total }];
    let unidadesNetas = items.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
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

  const retiros = await db.collection('cashwithdrawals')
    .find({ createdAt: { $gte: close.desdeAt, $lt: close.hastaAt } })
    .sort({ createdAt: 1 })
    .toArray();
  const totalRetiros = retiros.reduce((a, r) => a + (r.monto || 0), 0);

  const devoluciones = await db.collection('returns')
    .find({ createdAt: { $gte: close.desdeAt, $lt: close.hastaAt } })
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
      fecha: r.createdAt,
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
  const sales = db.collection('sales');
  const products = db.collection('products');
  const returns = db.collection('returns');
  const movements = db.collection('stockmovements');
  const closes = db.collection('dailycloses');

  console.log(APPLY ? 'MODO APPLY: se modificarán los datos' : 'MODO DRY-RUN: no se modifica nada');
  if (APPLY) await backup(db);

  const resumen = { ventasReconstruidas: 0, ventasLegacy: 0, ventasRevisar: 0, depositoVarado: 0, cantidadSincronizada: 0, cierresCorregidos: 0, cierresRevisar: 0 };

  // 1) Ventas activas corruptas (items vacío + total 0) con una sola devolución reconstruible.
  //    Va PRIMERO para que la migración legacy no las capture con subtotal 0.
  const corruptas = await sales
    .find({
      estado: { $ne: 'devuelta' },
      total: 0,
      $or: [{ items: { $exists: false } }, { items: { $size: 0 } }],
    })
    .toArray();

  for (const sale of corruptas) {
    const devoluciones = await returns.find({ sale: sale._id }).toArray();
    const conSnapshot = devoluciones.filter((r) => r.precioUnitario > 0);
    if (devoluciones.length !== 1 || conSnapshot.length !== 1) {
      resumen.ventasRevisar++;
      console.log(`[revisar] Venta ${sale.ticketNumero || sale._id}: items vacío y ${devoluciones.length} devolución(es); no se puede reconstruir automáticamente.`);
      continue;
    }
    const r = conSnapshot[0];
    const producto = await products.findOne({ _id: r.producto });
    const precio = r.precioUnitario;
    const item = {
      producto: r.producto,
      cantidad: r.cantidad,
      precio,
      talle: r.talle || '',
      color: r.color || '',
      subtotal: Math.round(precio * r.cantidad),
    };
    const factor = 1 - (sale.descuento || 0) / 100;
    const total = Math.round(item.subtotal * factor);
    const pagos = (r.pagosOriginales || []).filter((p) => (p.monto || 0) > 0);
    const pagosFinal = pagos.length > 0
      ? pagos
      : [{ metodo: sale.metodoPago || 'efectivo', monto: total }];
    if (APPLY) {
      await sales.updateOne(
        { _id: sale._id },
        {
          $set: {
            items: [item],
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
    console.log(`[ok] Venta ${sale.ticketNumero || sale._id} reconstruida con ${producto?.nombre || 'producto'} x${r.cantidad} ($${total / 100}).`);
  }

  // 2) Ventas legacy sin items[] (con total > 0) -> completar desde los campos viejos
  const legacy = await sales
    .find({
      $or: [{ items: { $exists: false } }, { items: { $size: 0 } }],
      producto: { $exists: true, $ne: null },
      total: { $gt: 0 },
    })
    .toArray();
  for (const sale of legacy) {
    if (!sale.precio || !sale.cantidad) {
      resumen.ventasRevisar++;
      console.log(`[revisar] Venta ${sale.ticketNumero || sale._id}: legacy sin precio/cantidad, no se puede migrar.`);
      continue;
    }
    const item = {
      producto: sale.producto,
      cantidad: sale.cantidad,
      precio: sale.precio,
      talle: sale.talle || '',
      color: '',
      subtotal: Math.round(sale.precio * sale.cantidad),
    };
    if (APPLY) {
      await sales.updateOne({ _id: sale._id }, { $set: { items: [item] } });
    }
    resumen.ventasLegacy++;
  }

  // 3) Productos con depósito raíz varado (variants + deposito > 0) -> mover a la primera variante
  const varados = await products.find({ 'variants.0': { $exists: true }, deposito: { $gt: 0 } }).toArray();
  for (const product of varados) {
    const destino = product.variants[0];
    const nuevoDeposito = (destino.deposito || 0) + product.deposito;
    if (APPLY) {
      const session = await mongoose.connection.startSession();
      try {
        session.startTransaction();
        await products.updateOne(
          { _id: product._id },
          { $set: { 'variants.0.deposito': nuevoDeposito, deposito: 0 } },
          { session }
        );
        await movements.insertOne({
          producto: product._id,
          productoNombre: product.nombre,
          talle: destino.talle || '',
          color: destino.color || '',
          tipo: 'ajuste_deposito',
          cantidad: product.deposito,
          empleado: 'Reparación automática',
          createdAt: new Date(),
          updatedAt: new Date(),
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
    console.log(`[ok] "${product.nombre}": ${product.deposito} unidad(es) movidas del depósito raíz a la variante ${[destino.talle, destino.color].filter(Boolean).join(' / ') || 'base'}.`);
  }

  // 4) cantidad inconsistente con la suma de variantes -> sincronizar
  const conVariantes = await products.find({ 'variants.0': { $exists: true } }).toArray();
  for (const product of conVariantes) {
    const suma = (product.variants || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    if ((product.cantidad || 0) !== suma) {
      if (APPLY) {
        await products.updateOne({ _id: product._id }, { $set: { cantidad: suma } });
      }
      resumen.cantidadSincronizada++;
      console.log(`[ok] "${product.nombre}": salón ${product.cantidad} -> ${suma} (suma de variantes).`);
    }
  }

  // 5) Cierres con montos mal convertidos (×100) -> recalcular desde ventas, retiros y devoluciones
  const todosLosCierres = await closes.find({}).toArray();
  for (const close of todosLosCierres) {
    const calc = await recalcularCierre(db, close);
    if (!calc) {
      resumen.cierresRevisar++;
      console.log(`[revisar] Cierre ${close._id}: sin ventana (desdeAt/hastaAt), no se puede recalcular.`);
      continue;
    }
    if (firmaCierre(close) === firmaCierre(calc)) continue;

    if (APPLY) {
      await closes.updateOne({ _id: close._id }, { $set: calc });
    }
    resumen.cierresCorregidos++;
    const fecha = new Date(close.fecha).toLocaleDateString('es-AR');
    console.log(
      `[ok] Cierre ${close.turno || 'legacy'} del ${fecha}: total ${close.total} -> ${calc.total} centavos` +
        ` (efectivo ${close.efectivo?.total || 0} -> ${calc.efectivo.total}, retiros ${close.totalRetiros || 0} -> ${calc.totalRetiros}).`
    );
  }

  console.log('\nResumen:', JSON.stringify(resumen, null, 2));
  console.log(
    resumen.ventasRevisar + resumen.cierresRevisar > 0
      ? 'Hay datos que requieren revisión manual (se listaron arriba).'
      : 'No quedaron datos pendientes de revisión.'
  );
  if (!APPLY) console.log('Dry-run finalizado. Para aplicar: node scripts/repair-data.js --apply');
};

run()
  .catch((error) => {
    console.error('Error en la reparación:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
