import mongoose from 'mongoose';
import logger from '../utils/LoggerUtils.js';

export const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  logger.info('Base de datos conectada', { servidor: conn.connection.host });
};
