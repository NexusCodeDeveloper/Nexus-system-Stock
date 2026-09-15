import './config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import logger from './utils/logger.js';
import { describirError } from './utils/mensajesError.js';
import { requestContext, requestLogger } from './middlewares/RequestLogger.js';
import { errorHandler } from './middlewares/ErrorMiddleware.js';
import AuthRoutes from './modules/Auth/AuthRoutes.js';
import SupplierRoutes from './modules/Supplier/SupplierRoutes.js';
import ProductRoutes from './modules/Product/ProductRoutes.js';
import StockMovementRoutes from './modules/StockMovement/StockMovementRoutes.js';
import ReturnRoutes from './modules/Return/ReturnRoutes.js';
import SaleRoutes from './modules/Sale/SaleRoutes.js';
import NotificationRoutes from './modules/Notification/NotificationRoutes.js';
import CashWithdrawalRoutes from './modules/CashWithdrawal/CashWithdrawalRoutes.js';
import PushRoutes from './modules/Push/PushRoutes.js';
import ErrorReportRoutes from './modules/ErrorReport/ErrorReportRoutes.js';
import User from './modules/Auth/AuthModel.js';
import Sale from './modules/Sale/SaleModel.js';
import { ensureTicketNumbers } from './modules/Sale/SaleController.js';

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

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(requestContext);
app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const rateLimitBase = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
};

const authLimiter = rateLimit({
  ...rateLimitBase,
  max: 30,
  message: { message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
});

const globalLimiter = rateLimit({
  ...rateLimitBase,
  max: 1500,
  message: { message: 'Demasiadas peticiones. Intente de nuevo en unos minutos.' },
});

const writeLimiter = rateLimit({
  ...rateLimitBase,
  max: 300,
  message: { message: 'Demasiadas operaciones. Intente de nuevo en unos minutos.' },
});

const errorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
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
app.use('/api/auth', AuthRoutes);
app.use('/api/suppliers', SupplierRoutes);
app.use('/api/products', ProductRoutes);
app.use('/api/stock-movements', StockMovementRoutes);
app.use('/api/returns', ReturnRoutes);
app.use('/api/sales', SaleRoutes);
app.use('/api/notifications', NotificationRoutes);
app.use('/api/cash-withdrawals', CashWithdrawalRoutes);
app.use('/api/push', PushRoutes);
app.use('/api/errors', errorLimiter, ErrorReportRoutes);

app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

if (!isDev) {
  const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
      if (!error || res.headersSent) return;
      res.status(404).json({ message: 'Frontend no compilado' });
    });
  });
}

app.use(errorHandler);

const seedUser = async (nombre, email, password, rol) => {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const exists = await User.exists({ email: emailNormalizado });
  if (exists) return;
  try {
    await User.create({ nombre, email: emailNormalizado, password, rol });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};

const seedUsers = async () => {
  try {
    await seedUser('Admin', process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'admin');
    logger.debug('Usuario admin verificado');

    await seedUser('Empleado', process.env.EMPLEADO_EMAIL, process.env.EMPLEADO_PASSWORD, 'user');
    logger.debug('Usuario empleado verificado');
  } catch (error) {
    const d = describirError(error);
    logger.error('No se pudieron crear los usuarios iniciales', {
      motivo: d.titulo,
      detalle: d.detalle,
      queRevisar: d.queRevisar || 'Revisá la conexión a la base de datos.',
      origen: 'backend',
      stack: error.stack,
    });
  }
};

const cerrarConError = (mensaje, error) => {
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
    await seedUsers();
    try {
      await Sale.init();
      const migradas = await ensureTicketNumbers();
      if (migradas > 0) logger.info(`Números de ticket asignados a ${migradas} ventas existentes`);
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
