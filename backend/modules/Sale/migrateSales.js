import mongoose from 'mongoose';
import Sale from './SaleModel.js';

async function migrateSales() {
  const cursor = Sale.find({ items: { $exists: false } }).cursor();
  let count = 0;

  for await (const sale of cursor) {
    sale.items = [{
      producto: sale.producto,
      cantidad: sale.cantidad,
      precio: sale.precio,
      talle: sale.talle || '',
      subtotal: sale.total,
    }];
    await sale.save();
    count++;
  }

  console.log(`Migradas ${count} ventas al formato items[]`);
}

export default migrateSales;
