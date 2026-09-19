import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

const candidatos =
  process.env.NODE_ENV === 'production'
    ? ['.env.production', '.env']
    : ['.env'];

for (const nombre of candidatos) {
  const ruta = path.join(backendDir, nombre);
  if (fs.existsSync(ruta)) {
    dotenv.config({ path: ruta });
    break;
  }
}
