import './config/env.js';
import bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL || 'admin@ejemplo.com';
const plainPassword = process.env.ADMIN_PASSWORD || 'password';

const hash = bcrypt.hashSync(plainPassword, 10);

console.log(`Email admin: ${email}`);
console.log('Contraseña configurada (ver backend/.env).');

const passwordOk = bcrypt.compareSync(plainPassword, hash);
console.log(`Validación del hash: ${passwordOk ? 'OK' : 'ERROR'}`);