import mongoose from 'mongoose';

const isDev = process.env.NODE_ENV !== 'production';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    if (isDev) console.log(`MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error al conectar MongoDB: ${error.message}`);
    process.exit(1);
  }
};
