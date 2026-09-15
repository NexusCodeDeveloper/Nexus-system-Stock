import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';
import Sale from '../modules/Sale/SaleModel.js';
import { generarTicketNumero } from '../modules/Sale/ticketUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER_ID = 'tickets-aleatorios-v1';
const APPLY = process.argv.includes('--apply');

const backup = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `tickets-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const docs = await db.collection('sales').find({}).toArray();
  fs.writeFileSync(path.join(dir, 'sales.json'), JSON.stringify(docs, null, 2));
  console.log(`Backup guardado en ${dir}`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const marker = await db.collection('migrations').findOne({ _id: MARKER_ID });
  if (marker) {
    console.log(`La migración ${MARKER_ID} ya fue aplicada el ${marker.appliedAt}. Nada para hacer.`);
    return;
  }

  console.log(APPLY ? 'MODO APPLY: se modificarán los datos' : 'MODO DRY-RUN: no se modifica nada');

  if (APPLY) await backup(db);

  const sales = await Sale.find({}).sort({ createdAt: 1 }).select('_id ticketNumero');
  let regenerados = 0;
  const muestras = [];

  for (const sale of sales) {
    const nuevo = await generarTicketNumero();
    regenerados += 1;
    if (muestras.length < 3) {
      muestras.push({
        venta: String(sale._id),
        antes: sale.ticketNumero || '(sin número)',
        despues: nuevo,
      });
    }
    if (APPLY) {
      sale.ticketNumero = nuevo;
      await sale.save();
    }
  }

  console.log(`\nVentas encontradas: ${sales.length} · regeneradas: ${regenerados}`);
  if (muestras.length > 0) {
    console.log('Ejemplos:');
    console.log(JSON.stringify(muestras, null, 2));
  }

  if (APPLY) {
    await db.collection('migrations').insertOne({ _id: MARKER_ID, appliedAt: new Date() });
    console.log(`\nMigración ${MARKER_ID} aplicada y marcada.`);
  } else {
    console.log('\nDry-run finalizado. Para aplicar: npm run migrate:tickets:apply');
  }
};

run()
  .catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
