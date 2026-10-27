import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import Venta from '../modules/Venta/VentaModel.js';
import CierreCaja from '../modules/Venta/CierreCajaModel.js';
import Devolucion from '../modules/Devolucion/DevolucionModel.js';
import Cliente from '../modules/Cliente/ClienteModel.js';
import MovimientoCuentaCorriente from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import Notificacion from '../modules/Notificacion/NotificacionModel.js';
import { crearVenta, abrirCaja, cerrarCaja, obtenerCajaAbierta, construirEventoVentaEmpleado } from '../modules/Venta/VentaController.js';
import { crearRetiroCaja, obtenerDisponibleCaja } from '../modules/RetiroCaja/RetiroCajaController.js';
import { ejecutarDevolucion, ejecutarCambio, revertirDevolucion } from '../modules/Devolucion/DevolucionService.js';
import { intercambiarProducto } from '../modules/Producto/ProductoController.js';
import { calcularSaldosDeCliente } from '../utils/CuentaCorrienteUtils.js';
import { montoEnCuentaCorriente, montoDevueltoEnCuentaCorriente } from '../modules/MovimientoCuentaCorriente/CuentaCorrienteService.js';

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
const crearCliente = (extra = {}) => Cliente.create({ nombre: 'Ana Lopez', ...extra });

const abrirCajaDeHoy = async (fondoInicial = 0) => {
  const res = await runHandler(abrirCaja, { body: { nombre: 'Turno Mañana', fondoInicial }, usuario: admin });
  assert.equal(res.status, 201);
  return res.body;
};

/** El precio del producto sale de la suma de los pagos, asi el ticket siempre cuadra. */
const vender = async ({ pagos, cliente, ...resto }, usuario = admin) => {
  const total = pagos.reduce((suma, pago) => suma + pago.monto, 0);
  const producto = await crearProducto({ precio: total, cantidad: 50 });
  const res = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1, precio: total }],
      offset: 0,
      pagos,
      cliente,
      ...resto,
    },
    usuario,
  });
  return { ...res, producto };
};

/** La promesa revienta con ZodError; manejadorErrores lo traduce a 400 en la respuesta real. */
const esperaZod = (error) => error?.name === 'ZodError';

const saldoDe = async (clienteId) => (await calcularSaldosDeCliente(clienteId)).saldo;

const cobrar = (cliente, monto, formaPago = 'efectivo', extra = {}) =>
  MovimientoCuentaCorriente.create({
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    tipo: 'credito',
    origen: 'pago',
    monto,
    formaPago,
    estado: 'activo',
    ...extra,
  });

test('vender a cuenta corriente genera el débito y guarda el cliente en el ticket', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  assert.equal(String(venta.body.cliente), String(cliente._id));
  assert.equal(venta.body.clienteNombre, 'Ana Lopez');
  assert.equal(venta.body.metodoPago, 'cuentaCorriente');

  const movimiento = await MovimientoCuentaCorriente.findOne({ cliente: cliente._id });
  assert.equal(movimiento.tipo, 'debito');
  assert.equal(movimiento.origen, 'factura');
  assert.equal(movimiento.monto, 10000);
  assert.equal(movimiento.estado, 'activo');
  assert.equal(movimiento.registradoPor, 'Admin');
  assert.equal(String(movimiento.origenVenta), String(venta.body._id));
  assert.equal(movimiento.referencia, venta.body.ticketNumero);
  assert.equal(await saldoDe(cliente._id), 10000);
});

test('cargar a cuenta corriente sin indicar el cliente se rechaza', async () => {
  await abrirCajaDeHoy();
  await assert.rejects(
    () => vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }] }),
    esperaZod
  );
  assert.equal(await Venta.countDocuments(), 0);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('cargar a cuenta corriente con un cliente inexistente no deja ticket ni movimiento', async () => {
  await abrirCajaDeHoy();
  const res = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: '507f1f77bcf86cd799439011', cantidad: 1 }],
      pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }],
      cliente: '507f1f77bcf86cd799439099',
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(res.status, 404);
  assert.equal(await Venta.countDocuments(), 0);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('una venta solo en efectivo no toca la cuenta corriente ni exige cliente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();
  const venta = await vender({ pagos: [{ metodo: 'efectivo', monto: 10000 }] });
  assert.ok(venta.body._id);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
  assert.equal(await saldoDe(cliente._id), 0);
});

test('el split de tres métodos carga a cuenta corriente solo la parte del cliente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [
      { metodo: 'efectivo', monto: 4000 },
      { metodo: 'tarjeta', monto: 3000 },
      { metodo: 'cuentaCorriente', monto: 3000 },
    ],
    cliente: String(cliente._id),
  });
  assert.ok(venta.body._id);
  assert.equal(await saldoDe(cliente._id), 3000);
  assert.equal((await MovimientoCuentaCorriente.findOne({ cliente: cliente._id })).monto, 3000);
});

test('no se aceptan cuatro métodos de pago ni repetir cuenta corriente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  await assert.rejects(
    () =>
      vender({
        pagos: [
          { metodo: 'efectivo', monto: 1000 },
          { metodo: 'tarjeta', monto: 1000 },
          { metodo: 'transferencia', monto: 1000 },
          { metodo: 'cuentaCorriente', monto: 7000 },
        ],
        cliente: String(cliente._id),
      }),
    esperaZod
  );

  await assert.rejects(
    () =>
      vender({
        pagos: [
          { metodo: 'cuentaCorriente', monto: 5000 },
          { metodo: 'cuentaCorriente', monto: 5000 },
        ],
        cliente: String(cliente._id),
      }),
    esperaZod
  );
  assert.equal(await Venta.countDocuments(), 0);
});

test('vender a cuenta corriente no suma a la gaveta, pero el cobro posterior sí', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(1000);

  await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });

  const disponibleSinCobro = await runHandler(obtenerDisponibleCaja, { query: { offset: 0 }, usuario: admin });
  assert.equal(disponibleSinCobro.body.disponible, 1000);

  await cobrar(cliente, 4000);

  const disponibleConCobro = await runHandler(obtenerDisponibleCaja, { query: { offset: 0 }, usuario: admin });
  assert.equal(disponibleConCobro.body.disponible, 5000);
});

test('un cobro por transferencia no suma a la gaveta', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(1000);
  await cobrar(cliente, 4000, 'transferencia');

  const disponible = await runHandler(obtenerDisponibleCaja, { query: { offset: 0 }, usuario: admin });
  assert.equal(disponible.body.disponible, 1000);
});

test('el retiro de caja puede usar el efectivo cobrado en cuenta corriente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(1000);
  await cobrar(cliente, 5000);

  const retiro = await runHandler(crearRetiroCaja, {
    body: { monto: 4000, motivo: 'Gasto', offset: 0 },
    usuario: admin,
  });
  assert.equal(retiro.status, 201);

  const imposible = await runHandler(crearRetiroCaja, {
    body: { monto: 3000, motivo: 'Gasto', offset: 0 },
    usuario: admin,
  });
  assert.equal(imposible.status, 400);
});

test('el resumen de caja separa la cuenta corriente y cuenta los cobros', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(2000);

  await vender({ pagos: [{ metodo: 'efectivo', monto: 10000 }] });
  await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 4000 }], cliente: String(cliente._id) });
  await cobrar(cliente, 1500);

  const resumen = await runHandler(obtenerCajaAbierta, { query: { offset: 0 }, usuario: admin });
  assert.equal(resumen.body.resumen.efectivo.total, 10000);
  assert.equal(resumen.body.resumen.cuentaCorriente.total, 4000);
  assert.equal(resumen.body.resumen.cuentaCorriente.cantidad, 1);
  assert.equal(resumen.body.resumen.totalCobrosCuentaCorriente, 1500);
  assert.equal(resumen.body.resumen.cobrosEfectivo, 1500);
  assert.equal(resumen.body.resumen.efectivoEsperado, 13500);
});

test('cerrar la caja persiste la cuenta corriente y los cobros del día', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(1000);

  await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 7000 }], cliente: String(cliente._id) });
  await cobrar(cliente, 2000);

  const cierre = await runHandler(cerrarCaja, { body: { nombre: 'Ana', offset: 0 }, usuario: admin });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.body.cuentaCorriente.total, 7000);
  assert.equal(cierre.body.totalCobrosCuentaCorriente, 2000);
  assert.equal(cierre.body.efectivoEsperado, 3000);

  const guardado = await CierreCaja.findOne({ estado: 'cerrado' });
  assert.equal(guardado.cuentaCorriente.total, 7000);
  assert.equal(guardado.totalCobrosCuentaCorriente, 2000);
  assert.equal(guardado.cobrosEfectivo, 2000);
});

test('un movimiento anulado no cuenta para el saldo ni para el efectivo esperado', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy(0);
  await cobrar(cliente, 9000, 'efectivo', { estado: 'anulado' });

  const resumen = await runHandler(obtenerCajaAbierta, { query: { offset: 0 }, usuario: admin });
  assert.equal(resumen.body.resumen.totalCobrosCuentaCorriente, 0);
  assert.equal(resumen.body.resumen.efectivoEsperado, 0);
  assert.equal(await saldoDe(cliente._id), 0);
});

test('devolver un ticket cargado a cuenta corriente le deja saldo a favor al cliente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  assert.equal(await saldoDe(cliente._id), 10000);

  const { devolucion } = await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'No le gustó', offset: 0 },
    admin
  );
  assert.equal(devolucion.montoDevuelto, 10000);
  assert.equal(devolucion.efectivoDevuelto, 0);
  assert.equal(await saldoDe(cliente._id), 0);

  const credito = await MovimientoCuentaCorriente.findOne({ origenDevolucion: devolucion._id });
  assert.equal(credito.tipo, 'credito');
  assert.equal(credito.origen, 'devolucion');
  assert.equal(credito.monto, 10000);
  assert.equal(String(credito.origenVenta), String(venta.body._id));
});

test('devolver un ticket con pago mixto solo devuelve la parte de la cuenta corriente', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [
      { metodo: 'efectivo', monto: 5000 },
      { metodo: 'cuentaCorriente', monto: 5000 },
    ],
    cliente: String(cliente._id),
  });

  const { devolucion } = await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'Cambio', offset: 0 },
    admin
  );

  const credito = await MovimientoCuentaCorriente.findOne({ origenDevolucion: devolucion._id });
  assert.equal(credito.monto, 5000);
  // Se devuelve el ticket entero, asi que la cuenta queda cuadrada: no debe nada.
  assert.equal(await saldoDe(cliente._id), 0);
});

test('devolver un ticket solo en efectivo no toca la cuenta corriente', async () => {
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'efectivo', monto: 10000 }] });
  await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'Devolución', offset: 0 },
    admin
  );

  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('anular una devolución anula su crédito en vez de borrarlo', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  const { devolucion } = await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'Error', offset: 0 },
    admin
  );
  assert.equal(await saldoDe(cliente._id), 0);

  await revertirDevolucion(String(devolucion._id), admin);

  assert.equal(await Devolucion.countDocuments(), 0);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 2);
  const credito = await MovimientoCuentaCorriente.findOne({ origenDevolucion: devolucion._id });
  assert.equal(credito.estado, 'anulado');
  assert.equal(credito.anuladoPor, 'Admin');
  assert.ok(credito.anuladoEn);
  assert.equal(await saldoDe(cliente._id), 10000);
});

test('un canje del día mueve la deuda al ticket nuevo', async () => {
  const cliente = await crearCliente();
  const cargado = await crearProducto({ nombre: 'Campera', precio: 25000, cantidad: 5 });
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  assert.equal(await saldoDe(cliente._id), 10000);

  const canje = await ejecutarCambio(
    {
      productoDevolver: String(venta.producto._id),
      cantidadDevolver: 1,
      productoCargar: String(cargado._id),
      cantidadCargar: 1,
      venta: String(venta.body._id),
      motivo: 'Cambio',
      offset: 0,
    },
    admin
  );

  assert.equal(String(canje.ventaDiferencia.cliente), String(cliente._id));
  const movimientos = await MovimientoCuentaCorriente.find({ cliente: cliente._id }).sort({ fechaCreacion: 1 });
  assert.equal(movimientos.length, 3);
  assert.equal(movimientos[1].tipo, 'credito');
  assert.equal(movimientos[1].monto, 10000);
  assert.equal(movimientos[2].tipo, 'debito');
  assert.equal(movimientos[2].monto, 25000);
  // La devolucion deja la cuenta en cero y el canje genera una deuda nueva de 25000.
  assert.equal(await saldoDe(cliente._id), 25000);
});

test('revertir un canje anula el crédito y el débito de la venta nueva', async () => {
  const cliente = await crearCliente();
  const cargado = await crearProducto({ nombre: 'Campera', precio: 25000, cantidad: 5 });
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  const canje = await ejecutarCambio(
    {
      productoDevolver: String(venta.producto._id),
      cantidadDevolver: 1,
      productoCargar: String(cargado._id),
      cantidadCargar: 1,
      venta: String(venta.body._id),
      motivo: 'Cambio',
      offset: 0,
    },
    admin
  );
  assert.equal(await saldoDe(cliente._id), 25000);

  const devolucion = await Devolucion.findOne({ ventaDiferenciaId: canje.ventaDiferencia._id });
  await revertirDevolucion(String(devolucion._id), admin);

  const movimientos = await MovimientoCuentaCorriente.find({ cliente: cliente._id }).sort({ fechaCreacion: 1 });
  assert.equal(movimientos.length, 3);
  // El debito de la venta original sigue activo: el ticket volvio a quedar vigente.
  assert.equal(movimientos[0].estado, 'activo');
  assert.equal(movimientos[1].estado, 'anulado');
  assert.equal(movimientos[2].estado, 'anulado');
  assert.equal(await saldoDe(cliente._id), 10000);
});

test('un cambio de un ticket de días anteriores puede cargar la diferencia a cuenta corriente', async () => {
  const cliente = await crearCliente();
  const devuelto = await crearProducto({ nombre: 'Remera', precio: 10000, cantidad: 5 });
  const cargado = await crearProducto({ nombre: 'Campera', precio: 25000, cantidad: 5 });
  await abrirCajaDeHoy();

  const ayer = new Date(Date.now() - 86400000);
  const vieja = await Venta.collection.insertOne({
    ticketNumero: 'T-CC0001',
    articulos: [{ producto: devuelto._id, cantidad: 1, precio: 1000000, talle: '', color: '', subtotal: 1000000 }],
    total: 1000000,
    empleado: 'Admin',
    pagos: [{ metodo: 'cuentaCorriente', monto: 1000000 }],
    metodoPago: 'cuentaCorriente',
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    estado: 'activa',
    fechaCreacion: ayer,
    fechaActualizacion: ayer,
  });
  await MovimientoCuentaCorriente.create({
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    tipo: 'debito',
    origen: 'factura',
    monto: 10000,
    formaPago: 'ninguno',
    estado: 'activo',
    origenVenta: vieja.insertedId,
  });
  assert.equal(await saldoDe(cliente._id), 10000);

  const res = await runHandler(intercambiarProducto, {
    body: {
      productoDevolver: String(devuelto._id),
      cantidadDevolver: 1,
      productoCargar: String(cargado._id),
      cantidadCargar: 1,
      venta: String(vieja.insertedId),
      motivo: 'Cambio',
      metodoPago: 'cuentaCorriente',
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.diferencia, 15000);

  const movimientos = await MovimientoCuentaCorriente.find({ cliente: cliente._id }).sort({ fechaCreacion: 1 });
  assert.equal(movimientos.length, 3);
  assert.equal(movimientos[1].tipo, 'credito');
  assert.equal(movimientos[1].monto, 10000);
  assert.equal(movimientos[2].tipo, 'debito');
  assert.equal(movimientos[2].monto, 15000);
  assert.equal(await saldoDe(cliente._id), 15000);
});

test('montoEnCuentaCorriente y montoDevueltoEnCuentaCorriente prorratean el split', () => {
  assert.equal(montoEnCuentaCorriente([{ metodo: 'efectivo', monto: 1000 }, { metodo: 'cuentaCorriente', monto: 2500 }]), 2500);
  assert.equal(montoEnCuentaCorriente([{ metodo: 'efectivo', monto: 1000 }]), 0);
  assert.equal(montoEnCuentaCorriente(), 0);

  const pagos = [
    { metodo: 'efectivo', monto: 5000 },
    { metodo: 'cuentaCorriente', monto: 5000 },
  ];
  assert.equal(montoDevueltoEnCuentaCorriente(pagos, 10000), 5000);
  assert.equal(montoDevueltoEnCuentaCorriente(pagos, 4000), 2000);
  assert.equal(montoDevueltoEnCuentaCorriente([{ metodo: 'efectivo', monto: 100 }], 100), 0);
  assert.equal(montoDevueltoEnCuentaCorriente([], 100), 0);
});

test('construirEventoVentaEmpleado arma el push para admins solo con empleados', () => {
  const venta = {
    ticketNumero: 'T-ABC12345',
    total: 20000,
    articulos: [{ cantidad: 2 }],
    clienteNombre: 'Ana Lopez',
    pagos: [{ metodo: 'efectivo' }],
  };
  const evento = construirEventoVentaEmpleado(venta, { rol: 'user', nombre: 'Empleado Uno' });

  assert.equal(evento.tipo, 'venta');
  assert.equal(evento.para, 'admins');
  assert.equal(evento.url, '/ventas');
  assert.match(evento.titulo, /Empleado Uno/);
  assert.match(evento.mensaje, /T-ABC12345/);
  assert.match(evento.mensaje, /20\.000,00/);
  assert.match(evento.mensaje, /Ana Lopez/);
  assert.match(evento.mensaje, /Efectivo/);

  assert.equal(construirEventoVentaEmpleado(venta, { rol: 'admin', nombre: 'Admin' }), null);
  assert.equal(construirEventoVentaEmpleado(null, { rol: 'user', nombre: 'Empleado Uno' }), null);
});

test('una venta de empleado no crea avisos persistentes', async () => {
  const empleado = { id: '507f1f77bcf86cd799439012', nombre: 'Empleado Uno', email: 'emp@x.com', rol: 'user' };
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'efectivo', monto: 20000 }] }, empleado);
  assert.equal(venta.status, 201);
  assert.equal(await Notificacion.countDocuments({}), 0);
});
