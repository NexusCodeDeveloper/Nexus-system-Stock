import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Product from '../modules/Product/ProductModel.js';
import Sale from '../modules/Sale/SaleModel.js';
import { createSale, deleteSale, abrirCaja, cerrarCaja, reabrirCaja, getCajaAbierta, getDailyCloses, migrateSaleItems } from '../modules/Sale/SaleController.js';
import DailyClose from '../modules/Sale/DailyCloseModel.js';
import { createReturn, deleteReturn } from '../modules/Return/ReturnController.js';
import { updateProduct, exchangeProduct, pasarAlSalon } from '../modules/Product/ProductController.js';
import { getAvailableCash, createCashWithdrawal } from '../modules/CashWithdrawal/CashWithdrawalController.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const crearProducto = (extra = {}) =>
  Product.create({ nombre: 'Remera', precio: 100, cantidad: 5, categoria: 'Ropa', ...extra });

const abrirCajaHoy = (nombre = 'Admin', fondoInicial = 0) =>
  runHandler(abrirCaja, { body: { nombre, fondoInicial, offset: 0 } });

test('vender sin caja abierta se rechaza con SIN_CAJA', async () => {
  const product = await crearProducto();
  const res = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SIN_CAJA');
  assert.equal((await Product.findById(product._id)).cantidad, 5);
});

test('abrir caja dos veces se rechaza', async () => {
  const primera = await abrirCajaHoy();
  assert.equal(primera.status, 201);
  const segunda = await abrirCajaHoy();
  assert.equal(segunda.status, 409);
});

test('cerrar caja sin apertura se rechaza', async () => {
  const res = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(res.status, 409);
});

test('devolución y retiro sin caja abierta se rechazan', async () => {
  const product = await crearProducto();
  const devolucion = await runHandler(createReturn, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'sin caja' },
  });
  assert.equal(devolucion.status, 409);
  assert.equal(devolucion.body.code, 'SIN_CAJA');

  const retiro = await runHandler(createCashWithdrawal, {
    body: { monto: 10, motivo: 'sin caja', offset: 0 },
  });
  assert.equal(retiro.status, 409);
  assert.equal(retiro.body.code, 'SIN_CAJA');
});

test('createSale descuenta stock, valida pagos y hace rollback si no coincide', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();

  const ok = await runHandler(createSale, {
    body: {
      items: [{ producto: String(product._id), cantidad: 2 }],
      pagos: [{ metodo: 'efectivo', monto: 200 }],
    },
  });
  assert.equal(ok.status, 201);
  assert.equal(Number(ok.body.total), 200);
  assert.equal((await Product.findById(product._id)).cantidad, 3);

  const invalida = await runHandler(createSale, {
    body: {
      items: [{ producto: String(product._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 50 }],
    },
  });
  assert.equal(invalida.status, 400);
  assert.equal((await Product.findById(product._id)).cantidad, 3, 'el stock no debe cambiar si falla el pago');
});

test('deleteSale restaura el stock y no deja rastros', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const venta = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 200 }] },
  });

  const borrado = await runHandler(deleteSale, { params: { id: String(venta.body._id) } });
  assert.equal(borrado.status, 200);
  assert.equal((await Product.findById(product._id)).cantidad, 5);
  assert.equal(await Sale.countDocuments(), 0);
});

test('agregar variantes a un producto con stock de salón se rechaza y no pierde unidades', async () => {
  const product = await crearProducto({ cantidad: 10 });

  const res = await runHandler(updateProduct, {
    params: { id: String(product._id) },
    body: { variants: [{ talle: 'M', color: '', deposito: 0 }] },
  });
  assert.equal(res.status, 409);

  const despues = await Product.findById(product._id);
  assert.equal(despues.cantidad, 10);
  assert.equal(despues.variants.length, 0);
});

test('devolución total + borrar devolución reconstruye la venta con precio y pagos originales', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const venta = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 200 }] },
  });

  const devolucion = await runHandler(createReturn, {
    body: { producto: String(product._id), cantidad: 2, motivo: 'arrepentimiento', sale: String(venta.body._id), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 0, 'la devolución del mismo día ya está reflejada en los pagos de la venta');

  let sale = await Sale.findById(venta.body._id);
  assert.equal(sale.estado, 'devuelta');
  assert.equal(sale.total, 0);
  assert.equal(sale.pagos.length, 0);

  const borrado = await runHandler(deleteReturn, { params: { id: String(devolucion.body._id) } });
  assert.equal(borrado.status, 200);

  sale = await Sale.findById(venta.body._id);
  assert.equal(sale.estado, 'activa');
  assert.equal(sale.items.length, 1);
  assert.equal(sale.items[0].cantidad, 2);
  assert.equal(sale.items[0].precio, 100);
  assert.equal(sale.total, 200);
  assert.equal(sale.pagos.length, 1);
  assert.equal(sale.pagos[0].monto, 200);
  assert.equal(sale.cantidadDevuelta, 0);
  assert.equal(sale.montoDevuelto, 0);

  assert.equal((await Product.findById(product._id)).cantidad, 3);
});

test('devolución sin ticket registra el efectivo devuelto y baja el disponible de caja', async () => {
  await abrirCajaHoy();
  const product = await crearProducto({ precio: 50 });
  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] },
  });

  const devolucion = await runHandler(createReturn, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'sin ticket' },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 50);
  assert.equal(Number(devolucion.body.montoDevuelto), 50);

  const disponible = await runHandler(getAvailableCash, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 0);
  assert.equal((await Product.findById(product._id)).cantidad, 5);
});

test('el fondo inicial se incluye en el disponible y en el resumen de caja', async () => {
  const abrir = await abrirCajaHoy('Juan', 500);
  assert.equal(abrir.status, 201);

  const product = await crearProducto({ precio: 50 });
  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] },
  });

  const estado = await runHandler(getCajaAbierta, {});
  assert.equal(estado.body.caja.abiertoPor, 'Juan');
  assert.equal(estado.body.caja.abiertoPorUsuario, 'Admin');
  assert.equal(Number(estado.body.caja.fondoInicial), 500);
  assert.equal(Number(estado.body.resumen.total), 50);
  assert.equal(Number(estado.body.resumen.efectivoEsperado), 550);

  const disponible = await runHandler(getAvailableCash, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 550);
  assert.equal(disponible.body.cajaAbierta, true);
});

test('cerrar caja calcula totales netos, registra devoluciones y bloquea borrar ventas incluidas', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const devuelta = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  const activa = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'tarjeta', monto: 100 }] },
  });
  await runHandler(createReturn, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'cambio', sale: String(devuelta.body._id) },
  });

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.estado, 'cerrado');
  assert.equal(Number(cierre.body.total), 100, 'la venta devuelta no debe sumar al total');
  assert.equal(Number(cierre.body.totalDevoluciones), 100);
  assert.equal(cierre.body.cantidad, 1);

  const borrar = await runHandler(deleteSale, { params: { id: String(activa.body._id) } });
  assert.equal(borrar.status, 409, 'no se puede borrar una venta de una caja cerrada');
  assert.equal(await Sale.countDocuments({ _id: activa.body._id }), 1);

  const vender = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(vender.status, 409, 'no se puede vender con la caja cerrada');
});

test('migrateSaleItems convierte ventas legacy sin items[]', async () => {
  const product = await crearProducto({ cantidad: 10 });
  await mongoose.connection.db.collection('sales').insertOne({
    producto: product._id,
    cantidad: 2,
    precio: 10000,
    talle: '',
    total: 20000,
    empleado: 'Viejo',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const migradas = await migrateSaleItems();
  assert.equal(migradas, 1);

  const sale = await Sale.findOne({ empleado: 'Viejo' });
  assert.equal(sale.items.length, 1);
  assert.equal(sale.items[0].precio, 100);
  assert.equal(sale.total, 200);
});

test('el cambio (exchange) funciona con ventas legacy sin items[] y guarda snapshot', async () => {
  await abrirCajaHoy();
  const product = await Product.create({
    nombre: 'Zapatilla',
    precio: 100,
    cantidad: 4,
    categoria: 'Calzado',
    variants: [
      { talle: 'M', color: '', cantidad: 2, deposito: 0 },
      { talle: 'L', color: '', cantidad: 2, deposito: 0 },
    ],
  });

  const legacy = await mongoose.connection.db.collection('sales').insertOne({
    producto: product._id,
    cantidad: 1,
    precio: 10000,
    talle: 'M',
    total: 10000,
    empleado: 'Viejo',
    metodoPago: 'efectivo',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await runHandler(exchangeProduct, {
    body: {
      productoDevolver: String(product._id),
      cantidadDevolver: 1,
      talleDevolver: 'M',
      productoCargar: String(product._id),
      cantidadCargar: 1,
      talleCargar: 'L',
      motivo: 'talle',
      sale: String(legacy.insertedId),
    },
  });
  assert.equal(res.status, 200);

  const actualizado = await Product.findById(product._id);
  const m = actualizado.variants.find((v) => v.talle === 'M');
  const l = actualizado.variants.find((v) => v.talle === 'L');
  assert.equal(m.cantidad, 3);
  assert.equal(l.cantidad, 1);
});

test('pasar al salón en lote es atómico: si una variante no tiene stock, no mueve nada', async () => {
  const product = await Product.create({
    nombre: 'Buzo',
    precio: 200,
    cantidad: 0,
    categoria: 'Ropa',
    variants: [
      { talle: 'M', color: '', cantidad: 0, deposito: 5 },
      { talle: 'L', color: '', cantidad: 0, deposito: 1 },
    ],
  });

  const falla = await runHandler(pasarAlSalon, {
    body: {
      items: [
        { producto: String(product._id), cantidad: 5, talle: 'M' },
        { producto: String(product._id), cantidad: 3, talle: 'L' },
      ],
    },
  });
  assert.equal(falla.status, 400);

  let actual = await Product.findById(product._id);
  assert.equal(actual.variants.find((v) => v.talle === 'M').deposito, 5, 'no debe mover stock si falla otra variante');
  assert.equal(actual.variants.find((v) => v.talle === 'L').deposito, 1);

  const ok = await runHandler(pasarAlSalon, {
    body: {
      items: [
        { producto: String(product._id), cantidad: 5, talle: 'M' },
        { producto: String(product._id), cantidad: 1, talle: 'L' },
      ],
    },
  });
  assert.equal(ok.status, 200);

  actual = await Product.findById(product._id);
  assert.equal(actual.variants.find((v) => v.talle === 'M').cantidad, 5);
  assert.equal(actual.variants.find((v) => v.talle === 'L').cantidad, 1);
  assert.equal(actual.variants.reduce((s, v) => s + v.deposito, 0), 0);
});

test('cambio del mismo día con diferencia a cobrar: la venta nueva vale el producto completo y la caja cuadra', async () => {
  await abrirCajaHoy();
  const producto = await Product.create({
    nombre: 'Camisa',
    precio: 100,
    cantidad: 3,
    categoria: 'Ropa',
    variants: [
      { talle: 'M', color: '', cantidad: 2, deposito: 0 },
      { talle: 'L', color: '', cantidad: 1, deposito: 0 },
    ],
  });

  const ventaA = await runHandler(createSale, {
    body: { items: [{ producto: String(producto._id), cantidad: 1, talle: 'M' }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });

  const cambio = await runHandler(exchangeProduct, {
    body: {
      productoDevolver: String(producto._id),
      cantidadDevolver: 1,
      talleDevolver: 'M',
      productoCargar: String(producto._id),
      cantidadCargar: 1,
      talleCargar: 'L',
      motivo: 'talle',
      sale: String(ventaA.body._id),
      metodoPago: 'efectivo',
      offset: 0,
    },
  });
  assert.equal(cambio.status, 200);

  const ventaNueva = await Sale.findById(cambio.body.ventaDiferenciaId);
  assert.equal(ventaNueva.total, 100, 'la venta del cambio debe valer el producto cargado completo');
  assert.equal(ventaNueva.pagos.length, 1);
  assert.equal(ventaNueva.pagos[0].monto, 100);

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(Number(cierre.body.efectivo.total), 100, 'la caja debe tener el valor del producto final');
});

test('cambio del mismo día con diferencia a favor: el reintegro se descuenta de la caja', async () => {
  await abrirCajaHoy();
  const caro = await Product.create({ nombre: 'Campera', precio: 100, cantidad: 2, categoria: 'Ropa' });
  const barato = await Product.create({ nombre: 'Bufanda', precio: 60, cantidad: 5, categoria: 'Accesorios' });

  const venta = await runHandler(createSale, {
    body: { items: [{ producto: String(caro._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 201);

  const cambio = await runHandler(exchangeProduct, {
    body: {
      productoDevolver: String(caro._id),
      cantidadDevolver: 1,
      productoCargar: String(barato._id),
      cantidadCargar: 1,
      motivo: 'precio',
      sale: String(venta.body._id),
      metodoPago: 'efectivo',
      offset: 0,
    },
  });
  assert.equal(cambio.status, 200);
  assert.equal(Number(cambio.body.diferencia), -40);

  const ventaNueva = await Sale.findById(cambio.body.ventaDiferenciaId);
  assert.equal(ventaNueva.total, 60);
  assert.equal(ventaNueva.pagos.length, 1);
  assert.equal(ventaNueva.pagos[0].monto, 60, 'el crédito de la campera menos el reintegro');

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(Number(cierre.body.efectivo.total), 60, 'caja real: 100 cobrados - 40 reintegrados');
});

test('devolución con ticket de un día anterior registra el efectivo devuelto y baja la caja de hoy', async () => {
  await abrirCajaHoy();
  const product = await crearProducto({ cantidad: 10, precio: 40 });
  const ayer = new Date(Date.now() - 86400000);
  const ventaAyer = await mongoose.connection.db.collection('sales').insertOne({
    ticketNumero: 'T-AYER0001',
    items: [{ producto: product._id, cantidad: 1, precio: 4000, talle: '', color: '', subtotal: 4000 }],
    producto: product._id,
    cantidad: 1,
    precio: 4000,
    talle: '',
    total: 4000,
    empleado: 'Viejo',
    pagos: [{ metodo: 'efectivo', monto: 4000 }],
    metodoPago: 'efectivo',
    estado: 'activa',
    createdAt: ayer,
    updatedAt: ayer,
  });

  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 40 }] },
  });

  const devolucion = await runHandler(createReturn, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'falla', sale: String(ventaAyer.insertedId), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 40, 'el reintegro de un ticket viejo sale de la caja de hoy');

  const disponible = await runHandler(getAvailableCash, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 0, '40 de la venta de hoy - 40 del reintegro');
});

test('getCajaAbierta devuelve null sin caja y el resumen con caja abierta', async () => {
  const vacio = await runHandler(getCajaAbierta, {});
  assert.equal(vacio.body.caja, null);
  assert.equal(vacio.body.resumen, null);

  await abrirCajaHoy();
  const con = await runHandler(getCajaAbierta, {});
  assert.equal(con.body.caja.estado, 'abierto');
  assert.ok(con.body.resumen);
  assert.equal(Number(con.body.resumen.total), 0);
});

test('reabrir caja permite volver a vender y registra cada reapertura', async () => {
  await abrirCajaHoy('Juan');
  const product = await crearProducto();
  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Juan', offset: 0 } });
  assert.equal(cierre.status, 200);

  const estadoCerrado = await runHandler(getCajaAbierta, { query: { offset: '0' } });
  assert.equal(estadoCerrado.body.caja, null);
  assert.ok(estadoCerrado.body.cierreHoy, 'debe informar el cierre de hoy');
  assert.equal(estadoCerrado.body.cierreHoy.cerradoPor, 'Juan');

  const reabrir = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir.status, 200);
  assert.equal(reabrir.body.estado, 'abierto');
  assert.equal(reabrir.body.reaperturas.length, 1);
  assert.equal(reabrir.body.reaperturas[0].por, 'Admin');

  const venta = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 201);

  const cierre2 = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre2.status, 200);
  assert.equal(Number(cierre2.body.total), 200);

  const doc = await DailyClose.findOne({ turno: 'dia' });
  assert.equal(doc.reaperturas.length, 1);

  const reabrir2 = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir2.status, 200);
  const doc2 = await DailyClose.findOne({ turno: 'dia' });
  assert.equal(doc2.reaperturas.length, 2, 'se puede reabrir más de una vez');
});

test('reabrir caja falla sin cierre de hoy y con otra caja abierta', async () => {
  const sinCierre = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(sinCierre.status, 409);

  await abrirCajaHoy();
  const conAbierta = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(conAbierta.status, 409);
});

test('una caja abierta de un día anterior bloquea vender, retirar y reabrir', async () => {
  const ayer = new Date(Date.now() - 86400000);
  const fechaAyer = new Date(Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate()));
  await DailyClose.create({
    fecha: fechaAyer,
    turno: 'dia',
    estado: 'abierto',
    abiertoAt: ayer,
    abiertoPor: 'Juan',
    total: 0,
    cantidad: 0,
  });

  const product = await crearProducto();
  const venta = await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 409);
  assert.equal(venta.body.code, 'CAJA_DIA_ANTERIOR');

  const retiro = await runHandler(createCashWithdrawal, { body: { monto: 10, motivo: 'x', offset: 0 } });
  assert.equal(retiro.status, 409);
  assert.equal(retiro.body.code, 'CAJA_DIA_ANTERIOR');

  const reabrir = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir.status, 409);
});

test('el historial de cierres no muestra cajas abiertas', async () => {
  await abrirCajaHoy();
  const abierto = await runHandler(getDailyCloses, { query: { offset: '0' } });
  assert.equal(abierto.body.length, 0);

  await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  const cerrado = await runHandler(getDailyCloses, { query: { offset: '0' } });
  assert.equal(cerrado.body.length, 1);
  assert.equal(cerrado.body[0].estado, 'cerrado');
});

test('el cierre guarda los montos en centavos una sola vez (sin ×100)', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  await runHandler(createSale, {
    body: { items: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'transferencia', monto: 100 }] },
  });
  await runHandler(createCashWithdrawal, {
    body: { monto: 30, motivo: 'prueba', offset: 0 },
  });

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(Number(cierre.body.total), 200, 'el documento devuelve pesos');
  assert.equal(Number(cierre.body.efectivo.total), 100);
  assert.equal(Number(cierre.body.transferencia.total), 100);
  assert.equal(Number(cierre.body.totalRetiros), 30);

  const doc = await DailyClose.findOne({ turno: 'dia' });
  const raw = await mongoose.connection.db.collection('dailycloses').findOne({ _id: doc._id });
  assert.equal(raw.total, 20000, 'el total crudo debe estar en centavos');
  assert.equal(raw.efectivo.total, 10000);
  assert.equal(raw.transferencia.total, 10000);
  assert.equal(raw.totalRetiros, 3000);
  assert.equal(raw.retiros[0].monto, 3000);
});
