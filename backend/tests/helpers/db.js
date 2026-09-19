import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Producto from '../../modules/Producto/ProductoModel.js';
import Venta from '../../modules/Venta/VentaModel.js';
import Devolucion from '../../modules/Devolucion/DevolucionModel.js';
import MovimientoStock from '../../modules/MovimientoStock/MovimientoStockModel.js';
import RetiroCaja from '../../modules/RetiroCaja/RetiroCajaModel.js';
import RetiroCajaDia from '../../modules/RetiroCaja/RetiroCajaDiaModel.js';
import CierreCaja from '../../modules/Venta/CierreCajaModel.js';
import Contador from '../../modules/Venta/ContadorModel.js';

let replSet;

export const startTestDB = async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { serverSelectionTimeoutMS: 30000 });
  await Promise.all([
    Producto.init(),
    Venta.init(),
    Devolucion.init(),
    MovimientoStock.init(),
    RetiroCaja.init(),
    RetiroCajaDia.init(),
    CierreCaja.init(),
    Contador.init(),
  ]);
};

export const stopTestDB = async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.connection.close();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
};

export const clearDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
};

export const runHandler = async (
  handler,
  { body = {}, params = {}, query = {}, usuario = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', rol: 'admin' } } = {}
) => {
  let statusCode = 200;
  let payload;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    },
  };
  const req = { body, params, query, usuario };
  await handler(req, res, (err) => {
    throw err;
  });
  return { status: statusCode, body: payload };
};
