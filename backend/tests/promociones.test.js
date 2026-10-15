import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import Promocion from '../modules/Promocion/PromocionModel.js';
import { crearVenta, abrirCaja } from '../modules/Venta/VentaController.js';
import { obtenerProductos, obtenerProducto, eliminarProducto } from '../modules/Producto/ProductoController.js';
import { crearPromocion, cancelarPromocion, eliminarPromocion, obtenerPromociones, obtenerPromocionesVigentes, obtenerProductosDePromocion } from '../modules/Promocion/PromocionController.js';
import promocionRoutes from '../modules/Promocion/PromocionRoutes.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const admin = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', email: 'admin@x.com', rol: 'admin' };

const crearProducto = (extra = {}) =>
  Producto.create({ nombre: 'Remera', categoria: 'Prendas', precio: 10000, cantidad: 50, ...extra });

const abrirCajaDeHoy = async (fondoInicial = 0) => {
  const res = await runHandler(abrirCaja, { body: { nombre: 'Turno Mañana', fondoInicial }, usuario: admin });
  assert.equal(res.status, 201);
  return res.body;
};

const rangoActivo = () => ({
  desde: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  hasta: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

const crearPromo = (extra = {}) =>
  runHandler(crearPromocion, {
    body: { nombre: 'Oferta', tipo: 'porcentaje', valor: 20, ...rangoActivo(), ...extra },
    usuario: admin,
  });

const esperaCodigo = (codigo) => (error) => error?.statusCode === codigo;

test('una promoción por porcentaje aplica el precio de oferta en los productos', async () => {
  const producto = await crearProducto();
  const res = await crearPromo({ productos: [String(producto._id)] });
  assert.equal(res.status, 201);
  assert.equal(res.body.estado, 'activa');

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].precio, 10000);
  assert.equal(listado.body[0].oferta.precioOferta, 8000);
  assert.equal(listado.body[0].oferta.tipo, 'porcentaje');

  const uno = await runHandler(obtenerProducto, { params: { id: String(producto._id) }, usuario: admin });
  assert.equal(uno.body.oferta.precioOferta, 8000);
});

test('una promoción por monto fijo descuenta ese monto', async () => {
  const producto = await crearProducto();
  await crearPromo({ tipo: 'monto', valor: 1500, productos: [String(producto._id)] });

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta.precioOferta, 8500);
});

test('la promoción para todos incluye los productos que se carguen después', async () => {
  await crearPromo({ todos: true, productos: [] });
  const nuevo = await crearProducto({ nombre: 'Campera', precio: 20000 });

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  const campera = listado.body.find((p) => String(p._id) === String(nuevo._id));
  assert.equal(campera.oferta.precioOferta, 16000);
});

test('una promoción programada o vencida no cambia el precio', async () => {
  const producto = await crearProducto();
  const ahora = Date.now();

  await crearPromo({
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(producto._id)],
  });
  let listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);

  await Promocion.deleteMany({});
  await crearPromo({
    desde: new Date(ahora - 7200000).toISOString(),
    hasta: new Date(ahora - 3600000).toISOString(),
    productos: [String(producto._id)],
  });
  listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);
});

test('no se permiten promociones superpuestas sobre el mismo producto', async () => {
  const producto = await crearProducto();
  const primera = await crearPromo({ productos: [String(producto._id)] });
  assert.equal(primera.status, 201);

  await assert.rejects(
    () => crearPromo({ productos: [String(producto._id)] }),
    esperaCodigo(409)
  );

  await assert.rejects(
    () => crearPromo({ todos: true, productos: [] }),
    esperaCodigo(409)
  );

  const otro = await crearProducto({ nombre: 'Campera' });
  const soloOtro = await crearPromo({ productos: [String(otro._id)] });
  assert.equal(soloOtro.status, 201);
});

test('se permiten promociones secuenciales sobre el mismo producto', async () => {
  const producto = await crearProducto();
  const ahora = Date.now();

  const primera = await crearPromo({
    desde: new Date(ahora - 3600000).toISOString(),
    hasta: new Date(ahora + 3600000).toISOString(),
    productos: [String(producto._id)],
  });
  assert.equal(primera.status, 201);

  const siguiente = await crearPromo({
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(producto._id)],
  });
  assert.equal(siguiente.status, 201);
});

test('la venta cobra el precio de oferta y el descuento global se aplica encima', async () => {
  const producto = await crearProducto({ precio: 10000 });
  await crearPromo({ productos: [String(producto._id)] });
  await abrirCajaDeHoy();

  const res = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 8000 }],
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.total, 8000);
  assert.equal(res.body.articulos[0].precio, 8000);

  const conDescuento = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 7200 }],
      descuento: 10,
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(conDescuento.status, 201);
  assert.equal(conDescuento.body.total, 7200);
});

test('cancelar una promoción devuelve el precio normal al instante', async () => {
  const producto = await crearProducto({ precio: 10000 });
  const promo = await crearPromo({ productos: [String(producto._id)] });

  const cancelada = await runHandler(cancelarPromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(cancelada.status, 200);
  assert.equal(cancelada.body.estado, 'cancelada');

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);

  await abrirCajaDeHoy();
  const venta = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 10000 }],
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(venta.body.total, 10000);
});

test('el listado de promociones devuelve estado y alcance', async () => {
  const producto = await crearProducto();
  await crearPromo({ productos: [String(producto._id)] });

  const res = await runHandler(obtenerPromociones, { usuario: admin });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].estado, 'activa');
  assert.equal(res.body[0].cantidadProductos, 1);
  assert.equal(res.body[0].creadoPor, 'Admin');
});

test('obtenerPromocionesVigentes lista activas y programadas, sin canceladas ni vencidas', async () => {
  const ahora = Date.now();
  const activo = await crearProducto({ nombre: 'Activo' });
  const programado = await crearProducto({ nombre: 'Programado' });
  const cancelado = await crearProducto({ nombre: 'Cancelado' });
  const vencido = await crearProducto({ nombre: 'Vencido' });

  await crearPromo({ nombre: 'Activa', productos: [String(activo._id)] });
  await crearPromo({
    nombre: 'Programada',
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(programado._id)],
  });
  const paraCancelar = await crearPromo({ nombre: 'Cancelada', productos: [String(cancelado._id)] });
  await runHandler(cancelarPromocion, { params: { id: String(paraCancelar.body._id) }, usuario: admin });
  await crearPromo({
    nombre: 'Vencida',
    desde: new Date(ahora - 7200000).toISOString(),
    hasta: new Date(ahora - 3600000).toISOString(),
    productos: [String(vencido._id)],
  });

  const res = await runHandler(obtenerPromocionesVigentes, { usuario: admin });
  assert.equal(res.status, 200);
  assert.ok(res.body.ahora, 'devuelve la hora del servidor para el cronómetro');
  const nombres = res.body.promociones.map((p) => p.nombre).sort();
  assert.deepEqual(nombres, ['Activa', 'Programada']);

  const activa = res.body.promociones.find((p) => p.nombre === 'Activa');
  assert.equal(activa.estado, 'activa');
  assert.equal(activa.cantidadProductos, 1);
  assert.equal(activa.todos, false);

  const programada = res.body.promociones.find((p) => p.nombre === 'Programada');
  assert.equal(programada.estado, 'programada');
});

test('la ruta /promociones/vigentes se registra antes del middleware admin', () => {
  const capas = promocionRoutes.stack;
  const indiceVigentes = capas.findIndex((c) => c.route?.path === '/vigentes');
  const indiceAdmin = capas.findIndex((c) => c.handle?.name === 'admin');
  assert.ok(indiceVigentes !== -1, 'la ruta /vigentes existe');
  assert.ok(indiceAdmin !== -1, 'el middleware admin existe');
  assert.ok(indiceVigentes < indiceAdmin, 'vigentes queda accesible para usuarios no admin');
});

test('obtenerProductosDePromocion devuelve solo los productos de la promo', async () => {
  const incluido = await crearProducto({ nombre: 'Incluido' });
  await crearProducto({ nombre: 'Fuera' });
  const promo = await crearPromo({ productos: [String(incluido._id)] });

  const res = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.vigente, true);
  assert.equal(res.body.productos.length, 1);
  assert.equal(res.body.productos[0].nombre, 'Incluido');
  assert.equal(res.body.productos[0].precioOferta, 8000);
  assert.equal(res.body.productos[0].cantidad, 50);
});

test('obtenerProductosDePromocion con todos devuelve el catálogo completo', async () => {
  await crearProducto({ nombre: 'A' });
  await crearProducto({ nombre: 'B' });
  const promo = await crearPromo({ todos: true, productos: [] });

  const res = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
});

test('obtenerProductosDePromocion pagina y valida el id', async () => {
  const a = await crearProducto({ nombre: 'A' });
  const b = await crearProducto({ nombre: 'B' });
  const c = await crearProducto({ nombre: 'C' });
  const promo = await crearPromo({ productos: [String(a._id), String(b._id), String(c._id)] });

  const pagina = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    query: { offset: '1', limit: '1' },
    usuario: admin,
  });
  assert.equal(pagina.status, 200);
  assert.equal(pagina.body.total, 3);
  assert.deepEqual(pagina.body.productos.map((p) => p.nombre), ['B']);

  const invalido = await runHandler(obtenerProductosDePromocion, { params: { id: 'no-es-id' }, usuario: admin });
  assert.equal(invalido.status, 404);

  const inexistente = await runHandler(obtenerProductosDePromocion, {
    params: { id: '507f1f77bcf86cd799439011' },
    usuario: admin,
  });
  assert.equal(inexistente.status, 404);
});

test('obtenerProductosDePromocion muestra el precio futuro en una promo programada', async () => {
  const ahora = Date.now();
  const producto = await crearProducto({ nombre: 'Programado', precio: 10000 });
  const promo = await crearPromo({
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(producto._id)],
  });

  const res = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.vigente, false);
  assert.equal(res.body.productos[0].precio, 10000);
  assert.equal(res.body.productos[0].precioOferta, 8000);
});

test('eliminar una promoción la quita del historial', async () => {
  const producto = await crearProducto();
  const promo = await crearPromo({ productos: [String(producto._id)] });
  await runHandler(cancelarPromocion, { params: { id: String(promo.body._id) }, usuario: admin });

  const borrado = await runHandler(eliminarPromocion, { params: { id: String(promo.body._id) }, usuario: admin });
  assert.equal(borrado.status, 200);

  const listado = await runHandler(obtenerPromociones, { usuario: admin });
  assert.equal(listado.body.length, 0);
});

test('eliminar una promoción activa devuelve los precios normales', async () => {
  const producto = await crearProducto({ precio: 10000 });
  const promo = await crearPromo({ productos: [String(producto._id)] });

  const conOferta = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(conOferta.body[0].oferta.precioOferta, 8000);

  const borrado = await runHandler(eliminarPromocion, { params: { id: String(promo.body._id) }, usuario: admin });
  assert.equal(borrado.status, 200);

  const sinOferta = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(sinOferta.body[0].oferta, null);
});

test('eliminar una promoción inexistente o inválida se rechaza', async () => {
  const invalido = await runHandler(eliminarPromocion, { params: { id: 'no-es-id' }, usuario: admin });
  assert.equal(invalido.status, 400);

  const inexistente = await runHandler(eliminarPromocion, {
    params: { id: '507f1f77bcf86cd799439011' },
    usuario: admin,
  });
  assert.equal(inexistente.status, 404);
});

test('los productos en la papelera no aparecen en promociones ni contadores', async () => {
  const activo = await crearProducto({ nombre: 'Activo' });
  const eliminado = await crearProducto({ nombre: 'Eliminado' });
  const promo = await crearPromo({ productos: [String(activo._id), String(eliminado._id)] });
  assert.equal(promo.status, 201);
  assert.equal(promo.body.cantidadProductos, 2);

  await runHandler(eliminarProducto, { params: { id: String(eliminado._id) }, usuario: admin });

  const vigentes = await runHandler(obtenerPromocionesVigentes, { usuario: admin });
  const alcance = vigentes.body.promociones.find((p) => String(p._id) === String(promo.body._id));
  assert.equal(alcance.cantidadProductos, 1, 'el contador no cuenta el producto eliminado');

  const listado = await runHandler(obtenerPromociones, { usuario: admin });
  assert.equal(listado.body[0].cantidadProductos, 1);

  const detalle = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(detalle.body.total, 1);
  assert.deepEqual(detalle.body.productos.map((p) => p.nombre), ['Activo']);
});

test('una promoción para todos no incluye productos en la papelera', async () => {
  await crearProducto({ nombre: 'Activo' });
  const eliminado = await crearProducto({ nombre: 'Eliminado' });
  const promo = await crearPromo({ todos: true, productos: [] });

  await runHandler(eliminarProducto, { params: { id: String(eliminado._id) }, usuario: admin });

  const vigentes = await runHandler(obtenerPromocionesVigentes, { usuario: admin });
  const alcance = vigentes.body.promociones.find((p) => String(p._id) === String(promo.body._id));
  assert.equal(alcance.cantidadProductos, null, 'para todos sigue siendo null');

  const detalle = await runHandler(obtenerProductosDePromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(detalle.body.total, 1);
  assert.deepEqual(detalle.body.productos.map((p) => p.nombre), ['Activo']);
});
