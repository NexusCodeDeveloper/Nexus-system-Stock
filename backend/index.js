import './config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { errorHandler } from './middlewares/ErrorMiddleware.js';
import AuthRoutes from './modules/Auth/AuthRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'EMPLEADO_EMAIL', 'EMPLEADO_PASSWORD'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`FATAL: Missing required environment variable ${env}`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 16 || process.env.JWT_SECRET.includes('cambia_esto')) {
  console.error('FATAL: JWT_SECRET debe tener al menos 16 caracteres y no ser un valor de ejemplo');
  process.exit(1);
}
import SupplierRoutes from './modules/Supplier/SupplierRoutes.js';
import ProductRoutes from './modules/Product/ProductRoutes.js';
import ReturnRoutes from './modules/Return/ReturnRoutes.js';
import SaleRoutes from './modules/Sale/SaleRoutes.js';
import NotificationRoutes from './modules/Notification/NotificationRoutes.js';
import SalesAuthRoutes from './modules/SalesAuth/SalesAuthRoutes.js';
import CashWithdrawalRoutes from './modules/CashWithdrawal/CashWithdrawalRoutes.js';
import User from './modules/Auth/AuthModel.js';
import Sale from './modules/Sale/SaleModel.js';
import { ensureTicketNumbers } from './modules/Sale/SaleController.js';

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
app.set('env', process.env.NODE_ENV || 'development');
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth', AuthRoutes);
app.use('/api/sales-auth/login', authLimiter);
app.use('/api/sales-auth', SalesAuthRoutes);
app.use('/api/suppliers', SupplierRoutes);
app.use('/api/products', ProductRoutes);
app.use('/api/returns', ReturnRoutes);
app.use('/api/sales', SaleRoutes);
app.use('/api/notifications', NotificationRoutes);
app.use('/api/cash-withdrawals', CashWithdrawalRoutes);

app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

if (!isDev) {
  const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

const seedUsers = async () => {
  try {
    await User.updateOne(
      { email: process.env.ADMIN_EMAIL },
      {
        $setOnInsert: {
          nombre: 'Admin',
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
          rol: 'admin',
        },
      },
      { upsert: true }
    );
    if (isDev) console.log('Usuario admin verificado');

    await User.updateOne(
      { email: process.env.EMPLEADO_EMAIL },
      {
        $setOnInsert: {
          nombre: 'Empleado',
          email: process.env.EMPLEADO_EMAIL,
          password: process.env.EMPLEADO_PASSWORD,
          rol: 'user',
        },
      },
      { upsert: true }
    );
    if (isDev) console.log('Usuario empleado verificado');
  } catch (error) {
    console.error('Error al crear usuarios:', error.message);
  }
};

connectDB()
  .then(async () => {
    await seedUsers();
    try {
      await Sale.init();
      const migradas = await ensureTicketNumbers();
      if (isDev && migradas > 0) console.log(`Números de ticket asignados a ${migradas} ventas existentes`);
    } catch (error) {
      console.error('Error al asignar números de ticket:', error.message);
    }
    app.listen(PORT, () => {
      if (isDev) console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('FATAL: No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  });

app.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`FATAL: El puerto ${PORT} ya está en uso`);
    process.exit(1);
  }
  console.error('FATAL: Error del servidor:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
