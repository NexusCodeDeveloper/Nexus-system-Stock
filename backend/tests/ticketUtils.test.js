import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../modules/Venta/TicketUtils.js';
import { aplicarDevolucionAlTicket } from '../modules/Devolucion/DevolucionService.js';

const ventaBase = () => ({
  cantidadDevuelta: 0,
  montoDevuelto: 0,
  devoluciones: [],
  pagos: [{ metodo: 'efectivo', monto: 100 }],
});

test('registrarDevolucionEnVenta acumula cantidades, montos y pagos', () => {
  const venta = ventaBase();
  registrarDevolucionEnVenta(venta, { motivo: 'Defectuoso', cantidad: 2, monto: 30 });
  assert.equal(venta.cantidadDevuelta, 2);
  assert.equal(venta.montoDevuelto, 30);
  assert.equal(venta.devoluciones.length, 1);
  assert.equal(venta.pagos[0].monto, 70);
});

test('registrarDevolucionEnVenta redondea los montos a centavos', () => {
  const venta = ventaBase();
  registrarDevolucionEnVenta(venta, { motivo: 'x', cantidad: 1, monto: 0.1 + 0.2 });
  assert.equal(venta.montoDevuelto, 0.3);
  assert.equal(venta.devoluciones[0].monto, 0.3);
});

test('anularDevolucionEnVenta revierte el registro exacto', () => {
  const venta = ventaBase();
  registrarDevolucionEnVenta(venta, { motivo: 'Defectuoso', cantidad: 2, monto: 30 });
  anularDevolucionEnVenta(venta, { cantidad: 2, monto: 30 });
  assert.equal(venta.cantidadDevuelta, 0);
  assert.equal(venta.montoDevuelto, 0);
  assert.equal(venta.devoluciones.length, 0);
  assert.equal(venta.pagos[0].monto, 100);
});

test('anularDevolucionEnVenta no deja valores negativos', () => {
  const venta = ventaBase();
  anularDevolucionEnVenta(venta, { cantidad: 5, monto: 999 });
  assert.equal(venta.cantidadDevuelta, 0);
  assert.equal(venta.montoDevuelto, 0);
});

test('aplicarDevolucionAlTicket elimina solo la línea consumida', () => {
  const venta = {
    descuento: 0,
    cantidadDevuelta: 0,
    montoDevuelto: 0,
    devoluciones: [],
    pagos: [{ metodo: 'efectivo', monto: 500 }],
    articulos: [
      { producto: 'p1', cantidad: 2, precio: 100, talle: '', color: '', subtotal: 200 },
      { producto: 'p1', cantidad: 3, precio: 100, talle: '', color: '', subtotal: 300 },
    ],
  };

  const resultado = aplicarDevolucionAlTicket(venta, { producto: 'p1', talle: '', color: '' }, 2, 'x');
  assert.equal(resultado.montoDevuelto, 200);
  assert.equal(venta.articulos.length, 1);
  assert.equal(venta.articulos[0].cantidad, 3);
  assert.equal(venta.total, 300);
});

test('aplicarDevolucionAlTicket consume varias líneas del mismo producto', () => {
  const venta = {
    descuento: 0,
    cantidadDevuelta: 0,
    montoDevuelto: 0,
    devoluciones: [],
    pagos: [{ metodo: 'efectivo', monto: 500 }],
    articulos: [
      { producto: 'p1', cantidad: 2, precio: 100, talle: '', color: '', subtotal: 200 },
      { producto: 'p1', cantidad: 3, precio: 100, talle: '', color: '', subtotal: 300 },
    ],
  };

  const resultado = aplicarDevolucionAlTicket(venta, { producto: 'p1', talle: '', color: '' }, 4, 'x');
  assert.equal(resultado.montoDevuelto, 400);
  assert.equal(venta.articulos.length, 1);
  assert.equal(venta.articulos[0].cantidad, 1);
  assert.equal(venta.total, 100);
});

test('la devolución reparte centavos exactos y la reversión restaura el total', () => {
  const venta = {
    cantidadDevuelta: 0,
    montoDevuelto: 0,
    devoluciones: [],
    pagos: [
      { metodo: 'efectivo', monto: 33.33 },
      { metodo: 'tarjeta', monto: 66.67 },
    ],
  };
  registrarDevolucionEnVenta(venta, { motivo: 'x', cantidad: 1, monto: 50 });
  const trasDevolucion = venta.pagos.reduce((s, p) => s + p.monto, 0);
  assert.equal(Math.round(trasDevolucion * 100) / 100, 50, 'la suma de pagos debe dar exactamente 50');

  anularDevolucionEnVenta(venta, { cantidad: 1, monto: 50 });
  const trasReversion = venta.pagos.reduce((s, p) => s + p.monto, 0);
  assert.equal(Math.round(trasReversion * 100) / 100, 100, 'la suma de pagos debe volver a 100');
});

test('las devoluciones se reparten entre pagos divididos', () => {
  const venta = {
    cantidadDevuelta: 0,
    montoDevuelto: 0,
    devoluciones: [],
    pagos: [
      { metodo: 'efectivo', monto: 60 },
      { metodo: 'transferencia', monto: 40 },
    ],
  };
  registrarDevolucionEnVenta(venta, { motivo: 'x', cantidad: 1, monto: 50 });
  const total = venta.pagos.reduce((s, p) => s + p.monto, 0);
  assert.equal(Math.round(total * 100) / 100, 50);
  assert.ok(venta.pagos.every((p) => p.monto >= 0));
});
