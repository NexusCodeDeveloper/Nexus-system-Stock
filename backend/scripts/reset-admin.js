import '../config/env.js';
import mongoose from 'mongoose';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const clave = process.env.ADMIN_PASSWORD;

if (!email || !clave) {
  console.error('No se encontraron ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const existente = await Usuario.findOne({ email });

  if (existente) {
    existente.clave = clave;
    existente.rol = 'admin';
    existente.activo = true;
    existente.versionToken = (existente.versionToken || 0) + 1;
    await existente.save();
    console.log('Listo: contraseña del administrador restablecida.');
  } else {
    await Usuario.create({ nombre: 'Admin', email, clave, rol: 'admin', activo: true });
    console.log('Listo: se volvió a crear la cuenta de administrador.');
  }

  console.log('  Email:', email);
  console.log('  Contraseña: la definida en backend/.env (ADMIN_PASSWORD)');
  console.log('  Sesiones abiertas de esa cuenta: cerradas');
} catch (error) {
  console.error('No se pudo restablecer la contraseña:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
