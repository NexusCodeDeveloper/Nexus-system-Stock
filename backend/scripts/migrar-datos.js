import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const COLECCIONES = ['usuarios', 'productos', 'ventas', 'devoluciones', 'movimientosStock', 'cierresCaja', 'retirosCaja'];

const respaldar = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', 'backups', `migrar-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const nombre of COLECCIONES) {
    const docs = await db.collection(nombre).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${nombre}.json`), JSON.stringify(docs, null, 2));
  }
  console.log(`Respaldo guardado en ${dir}`);
};

const moverCampo = async (db, coleccion, de, a) => {
  const filtro = { [de]: { $exists: true }, [a]: { $exists: false } };
  const etiqueta = `\`${de}\` -> \`${a}\` (${coleccion})`;
  if (!APPLY) {
    const cantidad = await db.collection(coleccion).countDocuments(filtro);
    if (cantidad > 0) console.log(`[pendiente] ${etiqueta}: ${cantidad} documento(s).`);
    return cantidad;
  }
  const resultado = await db.collection(coleccion).updateMany(filtro, { $rename: { [de]: a } });
  if (resultado.modifiedCount > 0) {
    console.log(`[migrado] ${etiqueta}: ${resultado.modifiedCount} documento(s).`);
  }
  return resultado.modifiedCount;
};

const TAREAS = [
  { coleccion: 'usuarios', pares: [['password', 'clave'], ['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
  { coleccion: 'productos', pares: [['variants', 'variantes'], ['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
  { coleccion: 'ventas', pares: [['items', 'articulos'], ['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
  { coleccion: 'devoluciones', pares: [['sale', 'venta'], ['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
  { coleccion: 'movimientosStock', pares: [['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
  { coleccion: 'cierresCaja', pares: [['desdeAt', 'desde'], ['hastaAt', 'hasta'], ['abiertoAt', 'abiertaEn'], ['cerradoAt', 'cerradaEn']] },
  { coleccion: 'retirosCaja', pares: [['createdAt', 'fechaCreacion'], ['updatedAt', 'fechaActualizacion']] },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  console.log(APPLY ? 'MODO APPLY: se modificarán los datos' : 'MODO DRY-RUN: no se modifica nada');
  if (APPLY) await respaldar(db);

  let total = 0;
  for (const tarea of TAREAS) {
    for (const par of tarea.pares) {
      total += await moverCampo(db, tarea.coleccion, par[0], par[1]);
    }
  }

  console.log(`\nResumen: ${total} documento(s) afectado(s).`);
  if (!APPLY) console.log('Dry-run finalizado. Para aplicar: node scripts/migrar-datos.js --apply');
};

run()
  .catch((error) => {
    console.error('Error en la migración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());