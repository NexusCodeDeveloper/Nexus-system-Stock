import './config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import logger from './utils/LoggerUtils.js';
import { describirError } from './utils/MensajesErrorUtils.js';
import { contextoPeticion, registradorPeticiones } from './middlewares/RequestLogger.js';
import { manejadorErrores } from './middlewares/ErrorMiddleware.js';
import AutenticacionRoutes from './modules/Autenticacion/AutenticacionRoutes.js';
import ProveedorRoutes from './modules/Proveedor/ProveedorRoutes.js';
import ProductoRoutes from './modules/Producto/ProductoRoutes.js';
import MovimientoStockRoutes from './modules/MovimientoStock/MovimientoStockRoutes.js';
import DevolucionRoutes from './modules/Devolucion/DevolucionRoutes.js';
import VentaRoutes from './modules/Venta/VentaRoutes.js';
import NotificacionRoutes from './modules/Notificacion/NotificacionRoutes.js';
import RetiroCajaRoutes from './modules/RetiroCaja/RetiroCajaRoutes.js';
import UsuarioRoutes from './modules/Usuario/UsuarioRoutes.js';
import PushRoutes from './modules/Push/PushRoutes.js';
import ReporteErrorRoutes from './modules/ReporteError/ReporteErrorRoutes.js';
import Usuario from './modules/Autenticacion/UsuarioModel.js';
import Venta from './modules/Venta/VentaModel.js';
import CierreCaja from './modules/Venta/CierreCajaModel.js';
import { asegurarNumerosTicket, migrarArticulosVenta } from './modules/Venta/VentaController.js';
import { limpiarSuscripcionesHuerfanas } from './services/PushService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'EMPLEADO_EMAIL', 'EMPLEADO_PASSWORD'];
const missingEnv = requiredEnv.filter((env) => !process.env[env]);
if (missingEnv.length > 0) {
  logger.error('Faltan variables de entorno requeridas', {
    motivo: missingEnv.join(', '),
    queRevisar: 'Copiá backend/.env.example a backend/.env y completá los valores.',
    origen: 'backend',
  });
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('cambia_esto')) {
  logger.error('El secreto de sesión (JWT_SECRET) no es válido', {
    motivo: 'Debe tener al menos 32 caracteres y no ser un valor de ejemplo.',
    queRevisar: 'Generá uno nuevo con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    origen: 'backend',
  });
  process.exit(1);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validarCredencialesIniciales = () => {
  const errores = [];
  for (const [emailVar, claveVar] of [
    ['ADMIN_EMAIL', 'ADMIN_PASSWORD'],
    ['EMPLEADO_EMAIL', 'EMPLEADO_PASSWORD'],
  ]) {
    if (!EMAIL_REGEX.test(process.env[emailVar] || '')) {
      errores.push(`${emailVar} no es un email válido`);
    }
    if ((process.env[claveVar] || '').length < 6) {
      errores.push(`${claveVar} debe tener al menos 6 caracteres`);
    }
  }
  if (errores.length > 0) {
    logger.error('Credenciales iniciales inválidas', {
      motivo: errores.join(', '),
      queRevisar: 'Corregí ADMIN_EMAIL/ADMIN_PASSWORD y EMPLEADO_EMAIL/EMPLEADO_PASSWORD en el .env.',
      origen: 'backend',
    });
    process.exit(1);
  }
};

if (process.env.NODE_ENV === 'production') {
  const clavesEjemplo = [
    process.env.ADMIN_PASSWORD === 'nexus2026',
    process.env.EMPLEADO_PASSWORD === 'empleado123',
  ];
  if (clavesEjemplo.some(Boolean)) {
    logger.error('Las contraseñas de ejemplo no se pueden usar en producción', {
      motivo: 'ADMIN_PASSWORD o EMPLEADO_PASSWORD conservan los valores de backend/.env.example.',
      queRevisar: 'Definí contraseñas propias y seguras en las variables de entorno del servidor.',
      origen: 'backend',
    });
    process.exit(1);
  }
}

validarCredencialesIniciales();

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 5000;

const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
app.set('trust proxy', Number.isFinite(trustProxy) ? trustProxy : 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
  logger.error('ALLOWED_ORIGINS no es válido', {
    motivo: 'No se permite "*" ni una lista vacía.',
    queRevisar: 'Definí los dominios exactos separados por coma (por ejemplo: https://stock.mitienda.com).',
    origen: 'backend',
  });
  process.exit(1);
}

app.use(contextoPeticion);
app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(registradorPeticiones);

const rateLimitBase = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

const authLimiter = rateLimit({
  ...rateLimitBase,
  limit: 30,
  message: { message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
});

const globalLimiter = rateLimit({
  ...rateLimitBase,
  limit: 1500,
  message: { message: 'Demasiadas peticiones. Intente de nuevo en unos minutos.' },
});

const writeLimiter = rateLimit({
  ...rateLimitBase,
  limit: 300,
  message: { message: 'Demasiadas operaciones. Intente de nuevo en unos minutos.' },
});

const errorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados reportes de error. Intente más tarde.' },
});

const soloEscrituras = (limiter) => (req, res, next) =>
  req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' ? next() : limiter(req, res, next);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', globalLimiter);
app.use('/api', soloEscrituras(writeLimiter));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth', AutenticacionRoutes);
app.use('/api/proveedores', ProveedorRoutes);
app.use('/api/usuarios', UsuarioRoutes);
app.use('/api/productos', ProductoRoutes);
app.use('/api/movimientos-stock', MovimientoStockRoutes);
app.use('/api/devoluciones', DevolucionRoutes);
app.use('/api/ventas', VentaRoutes);
app.use('/api/notificaciones', NotificacionRoutes);
app.use('/api/retiros-caja', RetiroCajaRoutes);
app.use('/api/push', PushRoutes);
app.use('/api/errores', errorLimiter, ReporteErrorRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

if (!isDev) {
  const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.use((req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
      if (!error || res.headersSent) return;
      res.status(404).json({ message: 'Frontend no compilado' });
    });
  });
}

app.use(manejadorErrores);

const sembrarUsuario = async (nombre, email, clave, rol) => {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const existe = await Usuario.exists({ email: emailNormalizado });
  if (existe) return;
  try {
    await Usuario.create({ nombre, email: emailNormalizado, clave, rol });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};

const sembrarUsuarios = async () => {
  await sembrarUsuario('Admin', process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin');
  logger.debug('Usuario admin verificado');

  try {
    await sembrarUsuario('Empleado', process.env.EMPLEADO_EMAIL, process.env.EMPLEADO_PASSWORD, 'user');
    logger.debug('Usuario empleado verificado');
  } catch (error) {
    const d = describirError(error);
    logger.warn('No se pudo crear el usuario empleado inicial', {
      motivo: d.titulo,
      detalle: d.detalle,
      queRevisar: d.queRevisar || 'Revisá la conexión a la base de datos.',
      origen: 'backend',
      stack: error.stack,
    });
  }
};

let cerrando = false;

const cerrarConError = (mensaje, error) => {
  if (cerrando) return;
  cerrando = true;
  const d = describirError(error);
  logger.error(mensaje, {
    motivo: d.titulo,
    detalle: d.detalle,
    queRevisar: d.queRevisar,
    origen: 'backend',
    stack: error?.stack,
  });
  logger.on('finish', () => process.exit(1));
  logger.end();
  setTimeout(() => process.exit(1), 2000).unref();
};

process.on('unhandledRejection', (reason) => {
  cerrarConError('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  cerrarConError('Uncaught exception', error);
});

connectDB()
  .then(async () => {
    try {
      await sembrarUsuarios();
    } catch (error) {
      cerrarConError('No se pudo crear el administrador inicial', error);
      return;
    }
    try {
      await Venta.init();
      await CierreCaja.init();
      const itemsMigrados = await migrarArticulosVenta();
      if (itemsMigrados > 0) logger.info(`Ventas legacy migradas al formato articulos[]: ${itemsMigrados}`);
      const migradas = await asegurarNumerosTicket();
      if (migradas > 0) logger.info(`Números de ticket asignados a ${migradas} ventas existentes`);
      const subsLimpiadas = await limpiarSuscripcionesHuerfanas();
      if (subsLimpiadas > 0) logger.info(`Suscripciones push de usuarios inactivos eliminadas: ${subsLimpiadas}`);
    } catch (error) {
      const d = describirError(error);
      logger.error('No se pudieron asignar los números de ticket pendientes', {
        motivo: d.titulo,
        detalle: d.detalle,
        queRevisar: d.queRevisar,
        origen: 'backend',
        stack: error.stack,
      });
    }
    const server = app.listen(PORT, () => {
      logger.info('Servidor corriendo', {
        puerto: PORT,
        entorno: process.env.NODE_ENV || 'development',
        nivelDeDetalle: logger.level,
      });
    });
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error('El puerto ya está en uso', {
          puerto: PORT,
          queRevisar: 'Cerrá el proceso que usa ese puerto o definí otro PORT en el .env.',
          origen: 'backend',
        });
      } else {
        const d = describirError(error);
        logger.error('Error del servidor', {
          motivo: d.titulo,
          detalle: d.detalle,
          queRevisar: d.queRevisar,
          origen: 'backend',
          stack: error.stack,
        });
      }
      process.exit(1);
    });
  })
  .catch((error) => {
    const d = describirError(error);
    logger.error('No se pudo iniciar el servidor', {
      motivo: d.titulo,
      detalle: d.detalle,
      queRevisar: d.queRevisar || 'Verificá MONGO_URI y que la base esté disponible.',
      origen: 'backend',
      stack: error.stack,
    });
    process.exit(1);
  });
