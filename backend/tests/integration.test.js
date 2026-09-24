import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import Venta from '../modules/Venta/VentaModel.js';
import { crearVenta, eliminarVenta, abrirCaja, cerrarCaja, reabrirCaja, obtenerCajaAbierta, obtenerCierresCaja, migrarArticulosVenta, eliminarCierreCaja, reenviarMailCierre } from '../modules/Venta/VentaController.js';
import CierreCaja from '../modules/Venta/CierreCajaModel.js';
import { crearDevolucion, eliminarDevolucion } from '../modules/Devolucion/DevolucionController.js';
import Devolucion from '../modules/Devolucion/DevolucionModel.js';
import { actualizarProducto, intercambiarProducto, pasarAlSalon } from '../modules/Producto/ProductoController.js';
import { obtenerDisponibleCaja, crearRetiroCaja, eliminarRetiroCaja } from '../modules/RetiroCaja/RetiroCajaController.js';
import RetiroCajaDia from '../modules/RetiroCaja/RetiroCajaDiaModel.js';
import { inicioDeDia } from '../utils/FechasUtils.js';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';
import SuscripcionPush from '../modules/Push/PushModel.js';
import { registrarSuscripcion, limpiarSuscripcionesHuerfanas } from '../services/PushService.js';
import { cambiarActivo } from '../modules/Usuario/UsuarioController.js';
import { iniciarSesion, cerrarSesion } from '../modules/Autenticacion/AutenticacionController.js';
import { proteger } from '../middlewares/AutenticacionMiddleware.js';
import { crearNotificacion, completarNotificacion, marcarVistasAdmin, obtenerNotificaciones } from '../modules/Notificacion/NotificacionController.js';

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
  Producto.create({ nombre: 'Remera', precio: 100, cantidad: 5, categoria: 'Ropa', ...extra });

const abrirCajaHoy = (nombre = 'Admin', fondoInicial = 0) =>
  runHandler(abrirCaja, { body: { nombre, fondoInicial, offset: 0 } });

test('vender sin caja abierta se rechaza con SIN_CAJA', async () => {
  const product = await crearProducto();
  const res = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SIN_CAJA');
  assert.equal((await Producto.findById(product._id)).cantidad, 5);
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
  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'sin caja' },
  });
  assert.equal(devolucion.status, 409);
  assert.equal(devolucion.body.code, 'SIN_CAJA');

  const retiro = await runHandler(crearRetiroCaja, {
    body: { monto: 10, motivo: 'sin caja', offset: 0 },
  });
  assert.equal(retiro.status, 409);
  assert.equal(retiro.body.code, 'SIN_CAJA');
});

test('crearVenta descuenta stock, valida pagos y hace rollback si no coincide', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();

  const ok = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(product._id), cantidad: 2 }],
      pagos: [{ metodo: 'efectivo', monto: 200 }],
    },
  });
  assert.equal(ok.status, 201);
  assert.equal(Number(ok.body.total), 200);
  assert.equal((await Producto.findById(product._id)).cantidad, 3);

  const invalida = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(product._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 50 }],
    },
  });
  assert.equal(invalida.status, 400);
  assert.equal((await Producto.findById(product._id)).cantidad, 3, 'el stock no debe cambiar si falla el pago');
});

test('eliminarVenta restaura el stock y no deja rastros', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 200 }] },
  });

  const borrado = await runHandler(eliminarVenta, { params: { id: String(venta.body._id) } });
  assert.equal(borrado.status, 200);
  assert.equal((await Producto.findById(product._id)).cantidad, 5);
  assert.equal(await Venta.countDocuments(), 0);
});

test('agregar variantes a un producto con stock de salón se rechaza y no pierde unidades', async () => {
  const product = await crearProducto({ cantidad: 10 });

  const res = await runHandler(actualizarProducto, {
    params: { id: String(product._id) },
    body: { variantes: [{ talle: 'M', color: '', deposito: 0 }] },
  });
  assert.equal(res.status, 409);

  const despues = await Producto.findById(product._id);
  assert.equal(despues.cantidad, 10);
  assert.equal(despues.variantes.length, 0);
});

test('devolución total + borrar devolución reconstruye la venta con precio y pagos originales', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 200 }] },
  });

  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 2, motivo: 'arrepentimiento', venta: String(venta.body._id), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 0, 'la devolución del mismo día ya está reflejada en los pagos de la venta');

  let ventaDoc = await Venta.findById(venta.body._id);
  assert.equal(ventaDoc.estado, 'devuelta');
  assert.equal(ventaDoc.total, 0);
  assert.equal(ventaDoc.pagos.length, 0);

  const borrado = await runHandler(eliminarDevolucion, { params: { id: String(devolucion.body._id) } });
  assert.equal(borrado.status, 200);

  ventaDoc = await Venta.findById(venta.body._id);
  assert.equal(ventaDoc.estado, 'activa');
  assert.equal(ventaDoc.articulos.length, 1);
  assert.equal(ventaDoc.articulos[0].cantidad, 2);
  assert.equal(ventaDoc.articulos[0].precio, 100);
  assert.equal(ventaDoc.total, 200);
  assert.equal(ventaDoc.pagos.length, 1);
  assert.equal(ventaDoc.pagos[0].monto, 200);
  assert.equal(ventaDoc.cantidadDevuelta, 0);
  assert.equal(ventaDoc.montoDevuelto, 0);

  assert.equal((await Producto.findById(product._id)).cantidad, 3);
});

test('devolución sin ticket registra el efectivo devuelto y baja el disponible de caja', async () => {
  await abrirCajaHoy();
  const product = await crearProducto({ precio: 50 });
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] },
  });

  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'sin ticket' },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 50);
  assert.equal(Number(devolucion.body.montoDevuelto), 50);

  const disponible = await runHandler(obtenerDisponibleCaja, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 0);
  assert.equal((await Producto.findById(product._id)).cantidad, 5);
});

test('el fondo inicial se incluye en el disponible y en el resumen de caja', async () => {
  const abrir = await abrirCajaHoy('Juan', 500);
  assert.equal(abrir.status, 201);

  const product = await crearProducto({ precio: 50 });
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] },
  });

  const estado = await runHandler(obtenerCajaAbierta, {});
  assert.equal(estado.body.caja.abiertoPor, 'Juan');
  assert.equal(estado.body.caja.abiertoPorUsuario, 'Admin');
  assert.equal(Number(estado.body.caja.fondoInicial), 500);
  assert.equal(Number(estado.body.resumen.total), 50);
  assert.equal(Number(estado.body.resumen.efectivoEsperado), 550);

  const disponible = await runHandler(obtenerDisponibleCaja, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 550);
  assert.equal(disponible.body.cajaAbierta, true);
});

test('cerrar caja calcula totales netos, registra devoluciones y bloquea borrar ventas incluidas', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const devuelta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  const activa = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'tarjeta', monto: 100 }] },
  });
  await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'cambio', venta: String(devuelta.body._id) },
  });

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.estado, 'cerrado');
  assert.equal(Number(cierre.body.total), 100, 'la venta devuelta no debe sumar al total');
  assert.equal(Number(cierre.body.totalDevoluciones), 100);
  assert.equal(cierre.body.cantidad, 1);

  const borrar = await runHandler(eliminarVenta, { params: { id: String(activa.body._id) } });
  assert.equal(borrar.status, 409, 'no se puede borrar una venta de una caja cerrada');
  assert.equal(await Venta.countDocuments({ _id: activa.body._id }), 1);

  const vender = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(vender.status, 409, 'no se puede vender con la caja cerrada');
});

test('migrarArticulosVenta convierte ventas legacy sin articulos[]', async () => {
  const product = await crearProducto({ cantidad: 10 });
  await mongoose.connection.db.collection('ventas').insertOne({
    producto: product._id,
    cantidad: 2,
    precio: 10000,
    talle: '',
    total: 20000,
    empleado: 'Viejo',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  });

  const migradas = await migrarArticulosVenta();
  assert.equal(migradas, 1);

  const venta = await Venta.findOne({ empleado: 'Viejo' });
  assert.equal(venta.articulos.length, 1);
  assert.equal(venta.articulos[0].precio, 100);
  assert.equal(venta.total, 200);
});

test('el cambio (exchange) funciona con ventas legacy sin articulos[] y guarda snapshot', async () => {
  await abrirCajaHoy();
  const product = await Producto.create({
    nombre: 'Zapatilla',
    precio: 100,
    cantidad: 4,
    categoria: 'Calzado',
    variantes: [
      { talle: 'M', color: '', cantidad: 2, deposito: 0 },
      { talle: 'L', color: '', cantidad: 2, deposito: 0 },
    ],
  });

  const legacy = await mongoose.connection.db.collection('ventas').insertOne({
    producto: product._id,
    cantidad: 1,
    precio: 10000,
    talle: 'M',
    total: 10000,
    empleado: 'Viejo',
    metodoPago: 'efectivo',
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  });

  const res = await runHandler(intercambiarProducto, {
    body: {
      productoDevolver: String(product._id),
      cantidadDevolver: 1,
      talleDevolver: 'M',
      productoCargar: String(product._id),
      cantidadCargar: 1,
      talleCargar: 'L',
      motivo: 'talle',
      venta: String(legacy.insertedId),
    },
  });
  assert.equal(res.status, 200);

  const actualizado = await Producto.findById(product._id);
  const m = actualizado.variantes.find((v) => v.talle === 'M');
  const l = actualizado.variantes.find((v) => v.talle === 'L');
  assert.equal(m.cantidad, 3);
  assert.equal(l.cantidad, 1);
});

test('pasar al salón en lote es atómico: si una variante no tiene stock, no mueve nada', async () => {
  const product = await Producto.create({
    nombre: 'Buzo',
    precio: 200,
    cantidad: 0,
    categoria: 'Ropa',
    variantes: [
      { talle: 'M', color: '', cantidad: 0, deposito: 5 },
      { talle: 'L', color: '', cantidad: 0, deposito: 1 },
    ],
  });

  const falla = await runHandler(pasarAlSalon, {
    body: {
      articulos: [
        { producto: String(product._id), cantidad: 5, talle: 'M' },
        { producto: String(product._id), cantidad: 3, talle: 'L' },
      ],
    },
  });
  assert.equal(falla.status, 400);

  let actual = await Producto.findById(product._id);
  assert.equal(actual.variantes.find((v) => v.talle === 'M').deposito, 5, 'no debe mover stock si falla otra variante');
  assert.equal(actual.variantes.find((v) => v.talle === 'L').deposito, 1);

  const ok = await runHandler(pasarAlSalon, {
    body: {
      articulos: [
        { producto: String(product._id), cantidad: 5, talle: 'M' },
        { producto: String(product._id), cantidad: 1, talle: 'L' },
      ],
    },
  });
  assert.equal(ok.status, 200);

  actual = await Producto.findById(product._id);
  assert.equal(actual.variantes.find((v) => v.talle === 'M').cantidad, 5);
  assert.equal(actual.variantes.find((v) => v.talle === 'L').cantidad, 1);
  assert.equal(actual.variantes.reduce((s, v) => s + v.deposito, 0), 0);
});

test('cambio del mismo día con diferencia a cobrar: la venta nueva vale el producto completo y la caja cuadra', async () => {
  await abrirCajaHoy();
  const producto = await Producto.create({
    nombre: 'Camisa',
    precio: 100,
    cantidad: 3,
    categoria: 'Ropa',
    variantes: [
      { talle: 'M', color: '', cantidad: 2, deposito: 0 },
      { talle: 'L', color: '', cantidad: 1, deposito: 0 },
    ],
  });

  const ventaA = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(producto._id), cantidad: 1, talle: 'M' }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });

  const cambio = await runHandler(intercambiarProducto, {
    body: {
      productoDevolver: String(producto._id),
      cantidadDevolver: 1,
      talleDevolver: 'M',
      productoCargar: String(producto._id),
      cantidadCargar: 1,
      talleCargar: 'L',
      motivo: 'talle',
      venta: String(ventaA.body._id),
      metodoPago: 'efectivo',
      offset: 0,
    },
  });
  assert.equal(cambio.status, 200);

  const ventaNueva = await Venta.findById(cambio.body.ventaDiferenciaId);
  assert.equal(ventaNueva.total, 100, 'la venta del cambio debe valer el producto cargado completo');
  assert.equal(ventaNueva.pagos.length, 1);
  assert.equal(ventaNueva.pagos[0].monto, 100);

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(Number(cierre.body.efectivo.total), 100, 'la caja debe tener el valor del producto final');
});

test('cambio del mismo día con diferencia a favor: el reintegro se descuenta de la caja', async () => {
  await abrirCajaHoy();
  const caro = await Producto.create({ nombre: 'Campera', precio: 100, cantidad: 2, categoria: 'Ropa' });
  const barato = await Producto.create({ nombre: 'Bufanda', precio: 60, cantidad: 5, categoria: 'Accesorios' });

  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(caro._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 201);

  const cambio = await runHandler(intercambiarProducto, {
    body: {
      productoDevolver: String(caro._id),
      cantidadDevolver: 1,
      productoCargar: String(barato._id),
      cantidadCargar: 1,
      motivo: 'precio',
      venta: String(venta.body._id),
      metodoPago: 'efectivo',
      offset: 0,
    },
  });
  assert.equal(cambio.status, 200);
  assert.equal(Number(cambio.body.diferencia), -40);

  const ventaNueva = await Venta.findById(cambio.body.ventaDiferenciaId);
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
  const ventaAyer = await mongoose.connection.db.collection('ventas').insertOne({
    ticketNumero: 'T-AYER0001',
    articulos: [{ producto: product._id, cantidad: 1, precio: 4000, talle: '', color: '', subtotal: 4000 }],
    producto: product._id,
    cantidad: 1,
    precio: 4000,
    talle: '',
    total: 4000,
    empleado: 'Viejo',
    pagos: [{ metodo: 'efectivo', monto: 4000 }],
    metodoPago: 'efectivo',
    estado: 'activa',
    fechaCreacion: ayer,
    fechaActualizacion: ayer,
  });

  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 40 }] },
  });

  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'falla', venta: String(ventaAyer.insertedId), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.efectivoDevuelto), 40, 'el reintegro de un ticket viejo venta de la caja de hoy');

  const disponible = await runHandler(obtenerDisponibleCaja, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 0, '40 de la venta de hoy - 40 del reintegro');
});

test('obtenerCajaAbierta devuelve null sin caja y el resumen con caja abierta', async () => {
  const vacio = await runHandler(obtenerCajaAbierta, {});
  assert.equal(vacio.body.caja, null);
  assert.equal(vacio.body.resumen, null);

  await abrirCajaHoy();
  const con = await runHandler(obtenerCajaAbierta, {});
  assert.equal(con.body.caja.estado, 'abierto');
  assert.ok(con.body.resumen);
  assert.equal(Number(con.body.resumen.total), 0);
});

test('reabrir caja permite volver a vender y registra cada reapertura', async () => {
  await abrirCajaHoy('Juan');
  const product = await crearProducto();
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Juan', offset: 0 } });
  assert.equal(cierre.status, 200);

  const estadoCerrado = await runHandler(obtenerCajaAbierta, { query: { offset: '0' } });
  assert.equal(estadoCerrado.body.caja, null);
  assert.ok(estadoCerrado.body.cierreHoy, 'debe informar el cierre de hoy');
  assert.equal(estadoCerrado.body.cierreHoy.cerradoPor, 'Juan');

  const reabrir = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir.status, 200);
  assert.equal(reabrir.body.estado, 'abierto');
  assert.equal(reabrir.body.reaperturas.length, 1);
  assert.equal(reabrir.body.reaperturas[0].por, 'Admin');

  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 201);

  const cierre2 = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre2.status, 200);
  assert.equal(Number(cierre2.body.total), 200);

  const doc = await CierreCaja.findOne({ turno: 'dia' });
  assert.equal(doc.reaperturas.length, 1);

  const reabrir2 = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir2.status, 200);
  const doc2 = await CierreCaja.findOne({ turno: 'dia' });
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
  await CierreCaja.create({
    fecha: fechaAyer,
    turno: 'dia',
    estado: 'abierto',
    abiertaEn: ayer,
    abiertoPor: 'Juan',
    total: 0,
    cantidad: 0,
  });

  const product = await crearProducto();
  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(venta.status, 409);
  assert.equal(venta.body.code, 'CAJA_DIA_ANTERIOR');

  const retiro = await runHandler(crearRetiroCaja, { body: { monto: 10, motivo: 'x', offset: 0 } });
  assert.equal(retiro.status, 409);
  assert.equal(retiro.body.code, 'CAJA_DIA_ANTERIOR');

  const reabrir = await runHandler(reabrirCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(reabrir.status, 409);
});

test('el historial de cierres no muestra cajas abiertas', async () => {
  await abrirCajaHoy();
  const abierto = await runHandler(obtenerCierresCaja, { query: { offset: '0' } });
  assert.equal(abierto.body.length, 0);

  await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  const cerrado = await runHandler(obtenerCierresCaja, { query: { offset: '0' } });
  assert.equal(cerrado.body.length, 1);
  assert.equal(cerrado.body[0].estado, 'cerrado');
});

test('el cierre guarda los montos en centavos una sola vez (sin ×100)', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'transferencia', monto: 100 }] },
  });
  await runHandler(crearRetiroCaja, {
    body: { monto: 30, motivo: 'prueba', offset: 0 },
  });

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(Number(cierre.body.total), 200, 'el documento devuelve pesos');
  assert.equal(Number(cierre.body.efectivo.total), 100);
  assert.equal(Number(cierre.body.transferencia.total), 100);
  assert.equal(Number(cierre.body.totalRetiros), 30);

  const doc = await CierreCaja.findOne({ turno: 'dia' });
  const raw = await mongoose.connection.db.collection('cierresCaja').findOne({ _id: doc._id });
  assert.equal(raw.total, 20000, 'el total crudo debe estar en centavos');
  assert.equal(raw.efectivo.total, 10000);
  assert.equal(raw.transferencia.total, 10000);
  assert.equal(raw.totalRetiros, 3000);
  assert.equal(raw.retiros[0].monto, 3000);
});

test('una caja en cierre bloquea ventas y el cierre se reanuda', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });

  await CierreCaja.updateOne({ estado: 'abierto' }, { $set: { estado: 'cerrando', cerradaEn: new Date() } });

  const bloqueada = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  assert.equal(bloqueada.status, 409, 'no se puede vender con la caja en cierre');
  assert.equal(bloqueada.body.code, 'SIN_CAJA');

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.estado, 'cerrado');
  assert.equal(Number(cierre.body.total), 100, 'la venta anterior al cierre debe quedar incluida');
});

test('no se puede borrar una venta mientras la caja se está cerrando', async () => {
  await abrirCajaHoy();
  const product = await crearProducto();
  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });

  await CierreCaja.updateOne({ estado: 'abierto' }, { $set: { estado: 'cerrando', cerradaEn: new Date() } });

  const borrado = await runHandler(eliminarVenta, { params: { id: String(venta.body._id) } });
  assert.equal(borrado.status, 409);
  assert.equal(await Venta.countDocuments({ _id: venta.body._id }), 1);
});

test('el efectivo esperado se persiste en el cierre', async () => {
  await abrirCajaHoy('Juan', 500);
  const product = await crearProducto({ precio: 50 });
  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] },
  });
  await runHandler(crearRetiroCaja, { body: { monto: 30, motivo: 'prueba' } });

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Juan', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(Number(cierre.body.efectivoEsperado), 520, 'fondo 500 + venta 50 - retiro 30');

  const doc = await CierreCaja.findOne({ turno: 'dia' });
  assert.equal(Number(doc.efectivoEsperado), 520);
});

test('dos retiros de la misma caja no superan el efectivo disponible', async () => {
  await abrirCajaHoy('Juan', 100);

  const primero = await runHandler(crearRetiroCaja, { body: { monto: 60, motivo: 'x' } });
  assert.equal(primero.status, 201);

  const segundo = await runHandler(crearRetiroCaja, { body: { monto: 60, motivo: 'y' } });
  assert.equal(segundo.status, 400, 'solo quedan 40 disponibles');

  const disponible = await runHandler(obtenerDisponibleCaja, { query: { offset: '0' } });
  assert.equal(disponible.body.disponible, 40);
});

test('eliminar un retiro devuelve el efectivo al disponible', async () => {
  await abrirCajaHoy('Juan', 100);
  const retiro = await runHandler(crearRetiroCaja, { body: { monto: 80, motivo: 'x' } });
  assert.equal(retiro.status, 201);

  const borrado = await runHandler(eliminarRetiroCaja, { params: { id: String(retiro.body._id) } });
  assert.equal(borrado.status, 200);

  const otro = await runHandler(crearRetiroCaja, { body: { monto: 80, motivo: 'y' } });
  assert.equal(otro.status, 201, 'el disponible debe volver a 100');

  const contador = await RetiroCajaDia.findOne({});
  assert.equal(Number(contador.retirado), 80);
});

test('eliminar el cierre limpia el contador de retiros de la caja', async () => {
  await abrirCajaHoy('Juan', 100);
  await runHandler(crearRetiroCaja, { body: { monto: 100, motivo: 'x' } });
  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Juan', offset: 0 } });
  assert.equal(cierre.status, 200);
  assert.equal(await RetiroCajaDia.countDocuments({}), 1);

  const doc = await CierreCaja.findOne({ turno: 'dia' });
  const borrado = await runHandler(eliminarCierreCaja, { params: { id: String(doc._id) } });
  assert.equal(borrado.status, 200);
  assert.equal(await RetiroCajaDia.countDocuments({}), 0, 'el contador de la caja eliminada no debe quedar');

  const reabrir = await abrirCajaHoy('Juan', 100);
  assert.equal(reabrir.status, 201);
  const retiro = await runHandler(crearRetiroCaja, { body: { monto: 100, motivo: 'y' } });
  assert.equal(retiro.status, 201, 'la caja nueva no debe heredar retiros de la caja anterior');
});

test('reenviar el mail de una caja abierta se rechaza', async () => {
  await abrirCajaHoy();
  const doc = await CierreCaja.findOne({ estado: 'abierto' });
  const res = await runHandler(reenviarMailCierre, { params: { id: String(doc._id) } });
  assert.equal(res.status, 409);
});

test('migrarArticulosVenta netea la cantidad ya devuelta', async () => {
  const product = await crearProducto({ cantidad: 10 });
  await mongoose.connection.db.collection('ventas').insertOne({
    producto: product._id,
    cantidad: 2,
    precio: 10000,
    talle: '',
    total: 20000,
    empleado: 'Viejo',
    cantidadDevuelta: 1,
    montoDevuelto: 10000,
    fechaCreacion: new Date(),
    fechaActualizacion: new Date(),
  });

  const migradas = await migrarArticulosVenta();
  assert.equal(migradas, 1);

  const venta = await Venta.findOne({ empleado: 'Viejo' });
  assert.equal(venta.articulos.length, 1);
  assert.equal(venta.articulos[0].cantidad, 1, 'no debe volver a contar la unidad devuelta');
  assert.equal(venta.total, 100);
  assert.equal(venta.estado, 'activa');
});

test('la devolución con líneas duplicadas en el ticket solo consume las unidades devueltas', async () => {
  await abrirCajaHoy();
  const product = await crearProducto({ cantidad: 10 });
  const venta = await runHandler(crearVenta, {
    body: {
      articulos: [
        { producto: String(product._id), cantidad: 2 },
        { producto: String(product._id), cantidad: 3 },
      ],
      pagos: [{ metodo: 'efectivo', monto: 500 }],
    },
  });
  assert.equal(venta.status, 201);

  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 2, motivo: 'parcial', venta: String(venta.body._id), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(Number(devolucion.body.montoDevuelto), 200);

  const doc = await Venta.findById(venta.body._id);
  assert.equal(doc.estado, 'activa', 'no debe quedar totalmente devuelta');
  assert.equal(doc.articulos.length, 1, 'solo se elimina la línea consumida');
  assert.equal(doc.articulos[0].cantidad, 3);
  assert.equal(doc.total, 300);
  assert.equal((await Producto.findById(product._id)).cantidad, 7);
});

test('eliminar una devolución ya revendida se rechaza en vez de recortar el stock', async () => {
  await abrirCajaHoy();
  const product = await crearProducto({ cantidad: 3 });
  const venta = await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] },
  });
  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(product._id), cantidad: 1, motivo: 'x', venta: String(venta.body._id), offset: 0 },
  });
  assert.equal(devolucion.status, 201);

  await runHandler(crearVenta, {
    body: { articulos: [{ producto: String(product._id), cantidad: 3 }], pagos: [{ metodo: 'efectivo', monto: 300 }] },
  });
  assert.equal((await Producto.findById(product._id)).cantidad, 0);

  const borrado = await runHandler(eliminarDevolucion, { params: { id: String(devolucion.body._id) } });
  assert.equal(borrado.status, 409);
  assert.equal((await Producto.findById(product._id)).cantidad, 0, 'el stock no debe recortarse en silencio');
  assert.equal(await Devolucion.countDocuments({ _id: devolucion.body._id }), 1);
});

test('la devolución de una línea completa de un ticket multilínea guarda los pagos originales', async () => {
  await abrirCajaHoy();
  const a = await Producto.create({ nombre: 'A', precio: 100, cantidad: 5, categoria: 'x' });
  const b = await Producto.create({ nombre: 'B', precio: 50, cantidad: 5, categoria: 'x' });
  const ayer = new Date(Date.now() - 86400000);
  const ventaAyer = await mongoose.connection.db.collection('ventas').insertOne({
    ticketNumero: 'T-MIXTA001',
    articulos: [
      { producto: a._id, cantidad: 1, precio: 10000, talle: '', color: '', subtotal: 10000 },
      { producto: b._id, cantidad: 1, precio: 5000, talle: '', color: '', subtotal: 5000 },
    ],
    producto: a._id,
    cantidad: 1,
    precio: 10000,
    talle: '',
    total: 15000,
    empleado: 'Viejo',
    pagos: [{ metodo: 'efectivo', monto: 5000 }, { metodo: 'tarjeta', monto: 10000 }],
    metodoPago: 'efectivo',
    estado: 'activa',
    fechaCreacion: ayer,
    fechaActualizacion: ayer,
  });

  const devolucion = await runHandler(crearDevolucion, {
    body: { producto: String(b._id), cantidad: 1, motivo: 'x', venta: String(ventaAyer.insertedId), offset: 0 },
  });
  assert.equal(devolucion.status, 201);
  assert.equal(devolucion.body.pagosOriginales.length, 2, 'debe guardar el snapshot de los pagos');
  assert.equal(Number(devolucion.body.efectivoDevuelto), 16.67, 'solo la parte de efectivo del pago dividido');

  const doc = await Venta.findById(ventaAyer.insertedId);
  assert.equal(doc.estado, 'activa');
  assert.equal(doc.articulos.length, 1);
  assert.equal(String(doc.articulos[0].producto), String(a._id));
});

test('el cambio de un ticket de otro día con diferencia a favor registra la venta del producto entregado', async () => {
  await abrirCajaHoy();
  const caro = await Producto.create({ nombre: 'Campera', precio: 100, cantidad: 5, categoria: 'Ropa' });
  const barato = await Producto.create({ nombre: 'Bufanda', precio: 60, cantidad: 5, categoria: 'Accesorios' });
  const ayer = new Date(Date.now() - 86400000);
  const ventaAyer = await mongoose.connection.db.collection('ventas').insertOne({
    ticketNumero: 'T-VIEJO01',
    articulos: [{ producto: caro._id, cantidad: 1, precio: 10000, talle: '', color: '', subtotal: 10000 }],
    producto: caro._id,
    cantidad: 1,
    precio: 10000,
    talle: '',
    total: 10000,
    empleado: 'Viejo',
    pagos: [{ metodo: 'efectivo', monto: 10000 }],
    metodoPago: 'efectivo',
    estado: 'activa',
    fechaCreacion: ayer,
    fechaActualizacion: ayer,
  });

  const cambio = await runHandler(intercambiarProducto, {
    body: {
      productoDevolver: String(caro._id),
      cantidadDevolver: 1,
      productoCargar: String(barato._id),
      cantidadCargar: 1,
      motivo: 'precio',
      venta: String(ventaAyer.insertedId),
      metodoPago: 'efectivo',
      offset: 0,
    },
  });
  assert.equal(cambio.status, 200);
  assert.equal(Number(cambio.body.diferencia), -40);
  assert.ok(cambio.body.ventaDiferenciaId, 'debe existir la venta del producto entregado');

  const ventaNueva = await Venta.findById(cambio.body.ventaDiferenciaId);
  assert.equal(ventaNueva.total, 60, 'la venta vale el producto entregado');
  assert.equal(ventaNueva.articulos[0].cantidad, 1);
  assert.equal(ventaNueva.articulos[0].subtotal, 60);

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Admin', offset: 0 } });
  assert.equal(Number(cierre.body.efectivo.total), 0, 'no entró efectivo nuevo');
  assert.equal(Number(cierre.body.efectivoDevuelto), 40, 'se devolvieron $40 en efectivo');
  assert.equal(Number(cierre.body.efectivoEsperado), 0);

  const stockCaro = await Producto.findById(caro._id);
  const stockBarato = await Producto.findById(barato._id);
  assert.equal(stockCaro.cantidad, 6);
  assert.equal(stockBarato.cantidad, 4);
});

const protegerConToken = async (token) => {
  let status = null;
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  await proteger(req, res, () => {
    status = 200;
  });
  return { status };
};

test('el logout revoca el token en el servidor', async () => {
  const usuario = await Usuario.create({ nombre: 'Emp', email: 'emp@x.com', clave: 'secreto123', rol: 'user' });

  const login = await runHandler(iniciarSesion, { body: { email: 'emp@x.com', clave: 'secreto123' } });
  assert.equal(login.status, 200);
  const token = login.body.token;

  const antes = await protegerConToken(token);
  assert.equal(antes.status, 200);

  const logout = await runHandler(cerrarSesion, { usuario: { id: String(usuario._id), rol: 'user' } });
  assert.equal(logout.status, 200);

  const despues = await protegerConToken(token);
  assert.equal(despues.status, 401, 'el token viejo ya no debe servir');

  const actualizado = await Usuario.findById(usuario._id);
  assert.equal(actualizado.versionToken, 1);
});

test('desactivar un usuario borra sus suscripciones push', async () => {
  const usuario = await Usuario.create({ nombre: 'Emp', email: 'emp2@x.com', clave: 'secreto123', rol: 'user' });
  await registrarSuscripcion(
    { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } },
    { id: String(usuario._id), email: usuario.email, nombre: usuario.nombre, rol: 'user' }
  );
  assert.equal(await SuscripcionPush.countDocuments(), 1);

  const res = await runHandler(cambiarActivo, { params: { id: String(usuario._id) }, body: { activo: false } });
  assert.equal(res.status, 200);
  assert.equal(await SuscripcionPush.countDocuments(), 0);
});

test('limpiarSuscripcionesHuerfanas borra las de usuarios inactivos o eliminados', async () => {
  const activo = await Usuario.create({ nombre: 'A', email: 'a@x.com', clave: 'secreto123', rol: 'user' });
  const inactivo = await Usuario.create({ nombre: 'B', email: 'b@x.com', clave: 'secreto123', rol: 'user', activo: false });
  const eliminado = await Usuario.create({ nombre: 'C', email: 'c@x.com', clave: 'secreto123', rol: 'user' });

  const suscripcion = (endpoint, id, email, nombre) =>
    registrarSuscripcion({ endpoint, keys: { p256dh: 'k', auth: 'a' } }, { id, email, nombre, rol: 'user' });

  await suscripcion('https://fcm.googleapis.com/fcm/send/a', String(activo._id), 'a@x.com', 'A');
  await suscripcion('https://fcm.googleapis.com/fcm/send/b', String(inactivo._id), 'b@x.com', 'B');
  await suscripcion('https://fcm.googleapis.com/fcm/send/c', String(eliminado._id), 'c@x.com', 'C');
  await eliminado.deleteOne();

  const borradas = await limpiarSuscripcionesHuerfanas();
  assert.equal(borradas, 2);
  assert.equal(await SuscripcionPush.countDocuments(), 1);
});

test('registrar una suscripción con endpoint no permitido se rechaza', async () => {
  await assert.rejects(
    () =>
      registrarSuscripcion(
        { endpoint: 'https://169.254.169.254/push', keys: { p256dh: 'k', auth: 'a' } },
        { id: '507f1f77bcf86cd799439011', email: 'x@x.com', nombre: 'X', rol: 'user' }
      ),
    (error) => error.statusCode === 400
  );
  assert.equal(await SuscripcionPush.countDocuments(), 0);
});

test('marcar vistas admin no oculta el aviso nuevo para los demás admins', async () => {
  const adminA = await Usuario.create({ nombre: 'AdminA', email: 'a@x.com', clave: 'secreto123', rol: 'admin' });
  const adminB = await Usuario.create({ nombre: 'AdminB', email: 'b@x.com', clave: 'secreto123', rol: 'admin' });
  const empleado = await Usuario.create({ nombre: 'Emp', email: 'e@x.com', clave: 'secreto123', rol: 'user' });

  const creada = await runHandler(crearNotificacion, {
    body: { titulo: 'Limpiar', descripcion: 'x' },
    usuario: { id: String(adminA._id), nombre: 'AdminA', rol: 'admin' },
  });
  assert.equal(creada.status, 201);

  const completada = await runHandler(completarNotificacion, {
    params: { id: String(creada.body._id) },
    body: { comentario: 'ok' },
    usuario: { id: String(empleado._id), nombre: 'Emp', rol: 'user' },
  });
  assert.equal(completada.status, 200);

  const vistaA = await runHandler(obtenerNotificaciones, { usuario: { id: String(adminA._id), rol: 'admin' } });
  assert.equal(vistaA.body[0].nuevaParaAdmin, true);

  await runHandler(marcarVistasAdmin, { usuario: { id: String(adminA._id), rol: 'admin' } });

  const trasA = await runHandler(obtenerNotificaciones, { usuario: { id: String(adminA._id), rol: 'admin' } });
  assert.equal(trasA.body[0].nuevaParaAdmin, false, 'el admin que la vio no la ve como nueva');

  const trasB = await runHandler(obtenerNotificaciones, { usuario: { id: String(adminB._id), rol: 'admin' } });
  assert.equal(trasB.body[0].nuevaParaAdmin, true, 'el otro admin todavía la ve como nueva');
});

test('un cierre legacy sin turno del mismo día bloquea abrir caja', async () => {
  await mongoose.connection.db.collection('cierresCaja').insertOne({
    fecha: inicioDeDia(0),
    estado: 'cerrado',
    total: 0,
    cantidad: 0,
  });

  const res = await abrirCajaHoy();
  assert.equal(res.status, 409, 'un cierre sin turno también debe considerarse el cierre del día');
});
