import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Product from '../../modules/Product/ProductModel.js';
import Sale from '../../modules/Sale/SaleModel.js';
import Return from '../../modules/Return/ReturnModel.js';
import StockMovement from '../../modules/StockMovement/StockMovementModel.js';
import CashWithdrawal from '../../modules/CashWithdrawal/CashWithdrawalModel.js';
import CashWithdrawalDay from '../../modules/CashWithdrawal/CashWithdrawalDayModel.js';
import DailyClose from '../../modules/Sale/DailyCloseModel.js';
import Counter from '../../modules/Sale/CounterModel.js';

let replSet;

export const startTestDB = async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { serverSelectionTimeoutMS: 30000 });
  await Promise.all([
    Product.init(),
    Sale.init(),
    Return.init(),
    StockMovement.init(),
    CashWithdrawal.init(),
    CashWithdrawalDay.init(),
    DailyClose.init(),
    Counter.init(),
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
  { body = {}, params = {}, query = {}, user = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', rol: 'admin' } } = {}
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
  const req = { body, params, query, user };
  await handler(req, res, (err) => {
    throw err;
  });
  return { status: statusCode, body: payload };
};
