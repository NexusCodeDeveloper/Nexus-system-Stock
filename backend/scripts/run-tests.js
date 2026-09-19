import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(dir, f));

if (files.length === 0) {
  console.error('No se encontraron tests en backend/tests');
  process.exit(1);
}

const resultado = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(resultado.status ?? 1);
