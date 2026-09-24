import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

const cargar = (nombre, override = false) => {
  const ruta = path.join(backendDir, nombre);
  if (fs.existsSync(ruta)) {
    dotenv.config({ path: ruta, override });
  }
};

cargar('.env');
if (process.env.NODE_ENV === 'production') {
  cargar('.env.production', true);
}

const ENTORNOS_VALIDOS = ['development', 'test', 'production'];
if (process.env.NODE_ENV && !ENTORNOS_VALIDOS.includes(process.env.NODE_ENV)) {
  console.error(
    `NODE_ENV inválido: "${process.env.NODE_ENV}". Valores válidos: ${ENTORNOS_VALIDOS.join(', ')}.`
  );
  process.exit(1);
}
