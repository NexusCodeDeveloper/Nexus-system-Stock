import test from 'node:test';
import assert from 'node:assert/strict';
import { encontrarVariante, indiceDeVariante, depositoDe, extraDeposito } from '../utils/VariantesUtils.js';

const producto = {
  deposito: 3,
  variantes: [
    { talle: 'S', color: 'Rojo', cantidad: 2, deposito: 5 },
    { talle: 'M', color: '', cantidad: 0, deposito: 0 },
  ],
};

test('indiceDeVariante encuentra la variante exacta', () => {
  assert.equal(indiceDeVariante(producto, 'S', 'Rojo'), 0);
  assert.equal(indiceDeVariante(producto, 'M', ''), 1);
  assert.equal(indiceDeVariante(producto, 'L', 'Rojo'), -1);
});

test('indiceDeVariante tolera null/undefined como cadena vacía', () => {
  assert.equal(indiceDeVariante(producto, null, undefined), -1);
  assert.equal(indiceDeVariante(producto, undefined, undefined), -1);
  assert.equal(indiceDeVariante({ variantes: [{ talle: '', color: '' }] }, null, undefined), 0);
});

test('encontrarVariante devuelve la variante o null', () => {
  assert.equal(encontrarVariante(producto, 'S', 'Rojo').cantidad, 2);
  assert.equal(encontrarVariante(producto, 'X', 'Y'), null);
});

test('depositoDe devuelve el depósito de la variante o el global', () => {
  assert.equal(depositoDe(producto, 'S', 'Rojo'), 5);
  assert.equal(depositoDe(producto, 'M', ''), 0);
  assert.equal(depositoDe({ deposito: 7, variantes: [] }, 'S', 'Rojo'), 7);
});

test('extraDeposito solo avisa cuando hay stock en depósito', () => {
  assert.match(extraDeposito(producto, 'S', 'Rojo'), /Hay 5 en depósito/);
  assert.equal(extraDeposito(producto, 'M', ''), '');
  assert.equal(extraDeposito({ deposito: 0, variantes: [] }, '', ''), '');
});
