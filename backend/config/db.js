import mongoose from 'mongoose';
import logger from '../utils/LoggerUtils.js';

let conexion = null;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!conexion) {
    conexion = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
      })
      .then((conn) => {
        logger.info('Base de datos conectada', { servidor: conn.connection.host });
        return conn;
      })
      .catch((error) => {
        conexion = null;
        throw error;
      });
  }
  return conexion;
};
