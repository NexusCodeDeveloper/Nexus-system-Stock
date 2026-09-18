import test from 'node:test';
import assert from 'node:assert/strict';
import { registrarDevolucionEnVenta, anularDevolucionEnVenta } from '../modules/Sale/ticketUtils.js';

const ventaBase = () => ({
  cantidadDevuelta: 0,
  montoDevuelto: 0,
  devoluciones: [],
  pagos: [{ metodo: 'efectivo', monto: 100 }],
});

test('registrarDevolucionEnVenta acumula cantidades, montos y pagos', () => {
  const sale = ventaBase();
  registrarDevolucionEnVenta(sale, { motivo: 'Defectuoso', cantidad: 2, monto: 30 });
  assert.equal(sale.cantidadDevuelta, 2);
  assert.equal(sale.montoDevuelto, 30);
  assert.equal(sale.devoluciones.length, 1);
  assert.equal(sale.pagos[0].monto, 70);
});

test('registrarDevolucionEnVenta redondea los montos a centavos', () => {
  const sale = ventaBase();
  registrarDevolucionEnVenta(sale, { motivo: 'x', cantidad: 1, monto: 0.1 + 0.2 });
  assert.equal(sale.montoDevuelto, 0.3);
  assert.equal(sale.devoluciones[0].monto, 0.3);
});

test('anularDevolucionEnVenta revierte el registro exacto', () => {
  const sale = ventaBase();
  registrarDevolucionEnVenta(sale, { motivo: 'Defectuoso', cantidad: 2, monto: 30 });
  anularDevolucionEnVenta(sale, { cantidad: 2, monto: 30 });
  assert.equal(sale.cantidadDevuelta, 0);
  assert.equal(sale.montoDevuelto, 0);
  assert.equal(sale.devoluciones.length, 0);
  assert.equal(sale.pagos[0].monto, 100);
});

test('anularDevolucionEnVenta no deja valores negativos', () => {
  const sale = ventaBase();
  anularDevolucionEnVenta(sale, { cantidad: 5, monto: 999 });
  assert.equal(sale.cantidadDevuelta, 0);
  assert.equal(sale.montoDevuelto, 0);
});

test('las devoluciones se reparten entre pagos divididos', () => {
  const sale = {
    cantidadDevuelta: 0,
    montoDevuelto: 0,
    devoluciones: [],
    pagos: [
      { metodo: 'efectivo', monto: 60 },
      { metodo: 'transferencia', monto: 40 },
    ],
  };
  registrarDevolucionEnVenta(sale, { motivo: 'x', cantidad: 1, monto: 50 });
  const total = sale.pagos.reduce((s, p) => s + p.monto, 0);
  assert.equal(Math.round(total * 100) / 100, 50);
  assert.ok(sale.pagos.every((p) => p.monto >= 0));
});
