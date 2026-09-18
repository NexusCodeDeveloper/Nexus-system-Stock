import test from 'node:test';
import assert from 'node:assert/strict';
import { findVariant, findVariantIdx, depositoDe, extraDeposito } from '../utils/variantes.js';

const producto = {
  deposito: 3,
  variants: [
    { talle: 'S', color: 'Rojo', cantidad: 2, deposito: 5 },
    { talle: 'M', color: '', cantidad: 0, deposito: 0 },
  ],
};

test('findVariantIdx encuentra la variante exacta', () => {
  assert.equal(findVariantIdx(producto, 'S', 'Rojo'), 0);
  assert.equal(findVariantIdx(producto, 'M', ''), 1);
  assert.equal(findVariantIdx(producto, 'L', 'Rojo'), -1);
});

test('findVariantIdx tolera null/undefined como cadena vacía', () => {
  assert.equal(findVariantIdx(producto, null, undefined), -1);
  assert.equal(findVariantIdx(producto, undefined, undefined), -1);
  assert.equal(findVariantIdx({ variants: [{ talle: '', color: '' }] }, null, undefined), 0);
});

test('findVariant devuelve la variante o null', () => {
  assert.equal(findVariant(producto, 'S', 'Rojo').cantidad, 2);
  assert.equal(findVariant(producto, 'X', 'Y'), null);
});

test('depositoDe devuelve el depósito de la variante o el global', () => {
  assert.equal(depositoDe(producto, 'S', 'Rojo'), 5);
  assert.equal(depositoDe(producto, 'M', ''), 0);
  assert.equal(depositoDe({ deposito: 7, variants: [] }, 'S', 'Rojo'), 7);
});

test('extraDeposito solo avisa cuando hay stock en depósito', () => {
  assert.match(extraDeposito(producto, 'S', 'Rojo'), /Hay 5 en depósito/);
  assert.equal(extraDeposito(producto, 'M', ''), '');
  assert.equal(extraDeposito({ deposito: 0, variants: [] }, '', ''), '');
});
