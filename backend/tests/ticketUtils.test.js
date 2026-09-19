import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../modules/Venta/TicketUtils.js';

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
