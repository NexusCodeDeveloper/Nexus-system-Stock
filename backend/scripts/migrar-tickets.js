import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';
import { generarTicketNumero } from '../modules/Venta/TicketUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER_ID = 'tickets-aleatorios-v1';
const APPLY = process.argv.includes('--apply');
const TICKET_VALIDO = /^T-[A-Z0-9]{8}$/;

const respaldar = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `tickets-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const docs = await db.collection('ventas').find({}).toArray();
  fs.writeFileSync(path.join(dir, 'ventas.json'), JSON.stringify(docs, null, 2));
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

  if (APPLY) await respaldar(db);

  const ventas = await db
    .collection('ventas')
    .find({ _ticketAleatorioV1: { $ne: true } })
    .sort({ fechaCreacion: 1 })
    .project({ ticketNumero: 1 })
    .toArray();
  let regenerados = 0;
  let yaValidos = 0;
  const muestras = [];

  for (const venta of ventas) {
    if (TICKET_VALIDO.test(venta.ticketNumero || '')) {
      yaValidos += 1;
      if (APPLY) {
        await db.collection('ventas').updateOne(
          { _id: venta._id },
          { $set: { _ticketAleatorioV1: true } }
        );
      }
      continue;
    }
    const nuevo = await generarTicketNumero();
    regenerados += 1;
    if (muestras.length < 3) {
      muestras.push({
        venta: String(venta._id),
        antes: venta.ticketNumero || '(sin número)',
        despues: nuevo,
      });
    }
    if (APPLY) {
      await db.collection('ventas').updateOne(
        { _id: venta._id },
        { $set: { ticketNumero: nuevo, _ticketAleatorioV1: true } }
      );
    }
  }

  console.log(`\nVentas encontradas: ${ventas.length} · regeneradas: ${regenerados} · ya válidas (solo marcadas): ${yaValidos}`);
  if (muestras.length > 0) {
    console.log('Ejemplos:');
    console.log(JSON.stringify(muestras, null, 2));
  }

  if (APPLY) {
    await db.collection('migrations').insertOne({ _id: MARKER_ID, appliedAt: new Date() });
    console.log(`\nMigración ${MARKER_ID} aplicada y marcada.`);
  } else {
    console.log('\nDry-run finalizado. Para aplicar: npm run migrar:tickets:aplicar');
  }
};

run()
  .catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
