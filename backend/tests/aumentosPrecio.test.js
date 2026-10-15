import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import AumentoPrecio from '../modules/Producto/AumentoPrecioModel.js';
import ProductoRoutes from '../modules/Producto/ProductoRoutes.js';
import {
  aplicarAumentoMasivo,
  obtenerAumentos,
  deshacerAumento,
} from '../modules/Producto/ProductoController.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

/** La promesa revienta con ZodError; manejadorErrores lo traduce a 400 en la respuesta real. */
const esperaZod = (error) => error?.name === 'ZodError';

const crearProducto = (extra = {}) =>
  Producto.create({ nombre: 'Remera', precio: 100, cantidad: 0, categoria: 'Ropa', ...extra });

test('el aumento por porcentaje actualiza los precios y registra el historial', async () => {
  const a = await crearProducto({ nombre: 'A', precio: 100 });
  const b = await crearProducto({ nombre: 'B', precio: 250.5 });

  const res = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'porcentaje', valor: 10, productos: [String(a._id), String(b._id)] },
    usuario: { id: '507f1f77bcf86cd799439011', nombre: 'Admin', rol: 'admin' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.cantidad, 2);

  const [aNuevo, bNuevo] = await Promise.all([Producto.findById(a._id), Producto.findById(b._id)]);
  assert.equal(aNuevo.precio, 110);
  assert.equal(bNuevo.precio, 275.55);

  const historial = await AumentoPrecio.find();
  assert.equal(historial.length, 1);
  assert.equal(historial[0].tipo, 'porcentaje');
  assert.equal(historial[0].valor, 10);
  assert.equal(historial[0].cantidad, 2);
  assert.equal(historial[0].creadoPor, 'Admin');
  assert.equal(historial[0].items.length, 2);
  assert.equal(historial[0].items[0].precioAnterior, 100);
  assert.equal(historial[0].items[0].precioNuevo, 110);
});

test('el aumento por monto fijo suma pesos exactos', async () => {
  const p = await crearProducto({ precio: 199.99 });

  const res = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'monto', valor: 50.5, productos: [String(p._id)] },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.cantidad, 1);
  const actualizado = await Producto.findById(p._id);
  assert.equal(actualizado.precio, 250.49);
});

test('el aumento omite productos en la papelera e ids inexistentes', async () => {
  const activo = await crearProducto({ nombre: 'Activo', precio: 100 });
  const borrado = await crearProducto({ nombre: 'Borrado', precio: 100, enPapelera: true });

  const res = await runHandler(aplicarAumentoMasivo, {
    body: {
      tipo: 'porcentaje',
      valor: 10,
      productos: [String(activo._id), String(borrado._id), '507f1f77bcf86cd799439011'],
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.cantidad, 1);
  assert.equal(res.body.omitidos, 2);
  assert.equal((await Producto.findById(activo._id)).precio, 110);
  assert.equal((await Producto.findById(borrado._id)).precio, 100);
});

test('si ningún producto seleccionado está disponible rechaza la operación', async () => {
  const borrado = await crearProducto({ enPapelera: true });

  const res = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'monto', valor: 10, productos: [String(borrado._id)] },
  });

  assert.equal(res.status, 400);
  assert.equal(await AumentoPrecio.countDocuments(), 0);
});

test('rechaza listas vacías, valores inválidos y porcentajes exagerados', async () => {
  const p = await crearProducto();
  await assert.rejects(
    () => runHandler(aplicarAumentoMasivo, { body: { tipo: 'porcentaje', valor: 10, productos: [] } }),
    esperaZod
  );
  await assert.rejects(
    () => runHandler(aplicarAumentoMasivo, { body: { tipo: 'porcentaje', valor: 0, productos: [String(p._id)] } }),
    esperaZod
  );
  await assert.rejects(
    () => runHandler(aplicarAumentoMasivo, { body: { tipo: 'porcentaje', valor: 10001, productos: [String(p._id)] } }),
    esperaZod
  );
  assert.equal(await AumentoPrecio.countDocuments(), 0);
});

test('deshacer restaura los precios anteriores y marca el registro', async () => {
  const p = await crearProducto({ precio: 100 });
  const aumento = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'porcentaje', valor: 20, productos: [String(p._id)] },
    usuario: { nombre: 'Admin', rol: 'admin' },
  });

  const res = await runHandler(deshacerAumento, {
    params: { id: String(aumento.body.aumento._id) },
    usuario: { nombre: 'Admin', rol: 'admin' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.cantidad, 1);
  assert.equal((await Producto.findById(p._id)).precio, 100);

  const registro = await AumentoPrecio.findById(aumento.body.aumento._id);
  assert.equal(registro.deshecho, true);
  assert.equal(registro.deshechoPor, 'Admin');
  assert.ok(registro.deshechoEn instanceof Date);
});

test('no se puede deshacer dos veces el mismo aumento', async () => {
  const p = await crearProducto();
  const aumento = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'monto', valor: 10, productos: [String(p._id)] },
  });
  const id = String(aumento.body.aumento._id);

  const primero = await runHandler(deshacerAumento, { params: { id } });
  assert.equal(primero.status, 200);

  const segundo = await runHandler(deshacerAumento, { params: { id } });
  assert.equal(segundo.status, 409);
});

test('deshacer no pisa precios editados después del aumento', async () => {
  const p = await crearProducto({ precio: 100 });
  const aumento = await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'porcentaje', valor: 10, productos: [String(p._id)] },
  });

  const editado = await Producto.findById(p._id);
  editado.precio = 500;
  await editado.save();

  const res = await runHandler(deshacerAumento, { params: { id: String(aumento.body.aumento._id) } });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'PRECIOS_CAMBIADOS');
  assert.equal((await Producto.findById(p._id)).precio, 500);
});

test('el historial lista los aumentos más recientes con su cantidad', async () => {
  const p = await crearProducto();
  await runHandler(aplicarAumentoMasivo, {
    body: { tipo: 'monto', valor: 5, productos: [String(p._id)] },
  });

  const res = await runHandler(obtenerAumentos, { query: { limit: '10' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].cantidad, 1);
  assert.equal(res.body[0].items, undefined, 'el listado no incluye el detalle de items');
});

test('la ruta /aumentos se registra antes de /:id', () => {
  const rutas = ProductoRoutes.stack.filter((capa) => capa.route).map((capa) => capa.route.path);
  assert.ok(rutas.includes('/aumentos'));
  assert.ok(rutas.indexOf('/aumentos') < rutas.indexOf('/:id'));
});
