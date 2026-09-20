import test from 'node:test';
import assert from 'node:assert/strict';
import { aCentavos, deCentavos, campoCentavos, campoCentavosPositivo } from '../utils/DineroUtils.js';

test('aCentavos convierte decimales a enteros', () => {
  assert.equal(aCentavos(123.45), 12345);
  assert.equal(aCentavos(0.1 + 0.2), 30);
  assert.equal(aCentavos('10.5'), 1050);
  assert.equal(aCentavos(null), 0);
  assert.equal(aCentavos(undefined), 0);
});

test('deCentavos convierte enteros a decimales', () => {
  assert.equal(deCentavos(12345), 123.45);
  assert.equal(deCentavos(0), 0);
  assert.equal(deCentavos('500'), 5);
});

test('campoCentavos aplica get y set', () => {
  assert.equal(campoCentavos.set(19.99), 1999);
  assert.equal(campoCentavos.get(1999), 19.99);
});

test('campoCentavosPositivo hereda el getter y setter', () => {
  assert.equal(campoCentavosPositivo.set(5.5), 550);
  assert.equal(campoCentavosPositivo.get(550), 5.5);
  assert.equal(campoCentavosPositivo.min, 0);
});
