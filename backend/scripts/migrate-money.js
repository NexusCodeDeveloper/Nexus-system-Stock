import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';
import { aCentavos } from '../utils/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER_ID = 'money-cents-v1';
const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const FORCE = process.argv.includes('--force');

const convert = (value) => (typeof value === 'number' ? aCentavos(value) : value);

const transforms = {
  products: (doc) => ({ precio: convert(doc.precio) }),
  sales: (doc) => {
    const upd = {};
    if (typeof doc.total === 'number') upd.total = convert(doc.total);
    if (typeof doc.precio === 'number') upd.precio = convert(doc.precio);
    if (typeof doc.montoDevuelto === 'number') upd.montoDevuelto = convert(doc.montoDevuelto);
    if (Array.isArray(doc.items)) upd.items = doc.items.map((i) => ({ ...i, precio: convert(i.precio), subtotal: convert(i.subtotal) }));
    if (Array.isArray(doc.pagos)) upd.pagos = doc.pagos.map((p) => ({ ...p, monto: convert(p.monto) }));
    if (Array.isArray(doc.devoluciones)) upd.devoluciones = doc.devoluciones.map((d) => ({ ...d, monto: convert(d.monto) }));
    return upd;
  },
  returns: (doc) => {
    const upd = {};
    if (typeof doc.diferencia === 'number') upd.diferencia = convert(doc.diferencia);
    if (typeof doc.montoDevuelto === 'number') upd.montoDevuelto = convert(doc.montoDevuelto);
    if (typeof doc.efectivoDevuelto === 'number') upd.efectivoDevuelto = convert(doc.efectivoDevuelto);
    if (typeof doc.precioUnitario === 'number') upd.precioUnitario = convert(doc.precioUnitario);
    if (Array.isArray(doc.pagosOriginales)) upd.pagosOriginales = doc.pagosOriginales.map((p) => ({ ...p, monto: convert(p.monto) }));
    return upd;
  },
  cashwithdrawals: (doc) => ({ monto: convert(doc.monto) }),
  dailycloses: (doc) => {
    const upd = {};
    if (typeof doc.total === 'number') upd.total = convert(doc.total);
    if (typeof doc.totalRetiros === 'number') upd.totalRetiros = convert(doc.totalRetiros);
    if (typeof doc.totalDevoluciones === 'number') upd.totalDevoluciones = convert(doc.totalDevoluciones);
    if (typeof doc.efectivoDevuelto === 'number') upd.efectivoDevuelto = convert(doc.efectivoDevuelto);
    for (const key of ['efectivo', 'transferencia', 'tarjeta']) {
      if (doc[key]) upd[key] = { ...doc[key], total: convert(doc[key].total) };
    }
    if (Array.isArray(doc.retiros)) upd.retiros = doc.retiros.map((r) => ({ ...r, monto: convert(r.monto) }));
    return upd;
  },
};

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const cambiosDe = (doc, upd) =>
  Object.keys(upd).filter((k) => JSON.stringify(doc[k]) !== JSON.stringify(upd[k]));

const backup = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `money-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(transforms)) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
  }
  console.log(`Backup guardado en ${dir}`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const migrations = db.collection('migrations');

  if (VERIFY) {
    const resumen = {};
    for (const name of Object.keys(transforms)) {
      const total = await db.collection(name).countDocuments();
      const sinMarca = await db.collection(name).countDocuments({ _moneyCentsV1: { $ne: true } });
      resumen[name] = { total, sinMarca };
    }
    console.log('Verificación de la migración de centavos:');
    console.log(JSON.stringify(resumen, null, 2));
    console.log(
      'Los documentos "sinMarca" creados después de la migración ya están en centavos y se saltan por fecha.\n' +
        'IMPORTANTE: detené el servidor antes de aplicar la migración para que no se creen documentos a mitad de camino.'
    );
    return;
  }

  const marker = await migrations.findOne({ _id: MARKER_ID });
  const yaAplicada = Boolean(marker && (marker.status === 'done' || (!marker.status && marker.appliedAt)));
  if (yaAplicada && !FORCE) {
    console.log(`La migración ${MARKER_ID} ya fue aplicada el ${marker.appliedAt || marker.startedAt}. Nada para hacer.`);
    return;
  }
  if (marker?.status === 'running' && !FORCE) {
    console.log(
      `La migración ${MARKER_ID} quedó a medias (status "running" desde ${marker.startedAt}). ` +
        'Verificá con --verify y reintentá con --force.'
    );
    return;
  }

  console.log(APPLY ? 'MODO APPLY: se modificarán los datos' : 'MODO DRY-RUN: no se modifica nada');

  if (APPLY) await backup(db);

  const startedAt = marker?.startedAt
    ? new Date(marker.startedAt)
    : marker?.appliedAt
      ? new Date(marker.appliedAt)
      : new Date();

  if (APPLY) {
    await migrations.updateOne(
      { _id: MARKER_ID },
      {
        $set: { status: 'running', startedAt, aplicadoPor: 'migrate-money' },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  const resumen = {};
  for (const [name, transform] of Object.entries(transforms)) {
    const coll = db.collection(name);
    const docs = await coll.find({}).toArray();
    let convertidos = 0;
    let saltadosPorFecha = 0;
    const muestras = [];

    for (const doc of docs) {
      if (doc._moneyCentsV1) continue;
      if (doc.createdAt && new Date(doc.createdAt) >= startedAt) {
        saltadosPorFecha++;
        continue;
      }
      const upd = transform(doc);
      const keys = cambiosDe(doc, upd);
      if (keys.length === 0) continue;
      convertidos++;
      if (muestras.length < 2) {
        muestras.push({ antes: pick(doc, keys), despues: pick(upd, keys) });
      }
      if (APPLY) await coll.updateOne({ _id: doc._id }, { $set: { ...upd, _moneyCentsV1: true } });
    }

    resumen[name] = { total: docs.length, convertidos, saltadosPorFecha };
    if (muestras.length > 0) {
      console.log(`\n[${name}] ejemplos de conversión:`);
      console.log(JSON.stringify(muestras, null, 2));
    }
  }

  console.log('\nResumen:', JSON.stringify(resumen, null, 2));

  if (APPLY) {
    await migrations.updateOne(
      { _id: MARKER_ID },
      { $set: { status: 'done', appliedAt: new Date() } }
    );
    console.log(`\nMigración ${MARKER_ID} aplicada y marcada.`);
  } else {
    console.log('\nDry-run finalizado. Para aplicar: node scripts/migrate-money.js --apply');
  }
};

run()
  .catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
