import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSchema, updateProductSchema } from '../modules/Product/ProductSchema.js';

const base = {
  nombre: 'Remera',
  precio: 1000,
  categoria: 'Indumentaria',
};

test('createProductSchema acepta variantes únicas', () => {
  const data = createProductSchema.parse({
    ...base,
    variants: [
      { talle: 'S', color: 'Rojo', deposito: 2 },
      { talle: 'M', color: 'Rojo', deposito: 3 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(data.variants.length, 2);
});

test('createProductSchema rechaza variantes repetidas (talle+color)', () => {
  const result = createProductSchema.safeParse({
    ...base,
    variants: [
      { talle: 'S', color: 'Rojo', deposito: 2 },
      { talle: 'S', color: 'Rojo', deposito: 5 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((i) => i.message).join(' '), /repetida/);
});

test('createProductSchema tolera diferencias de mayúsculas/espacios al detectar repetidas', () => {
  const result = createProductSchema.safeParse({
    ...base,
    variants: [
      { talle: 's', color: 'Rojo', deposito: 1 },
      { talle: 'S ', color: ' rojo', deposito: 1 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
});

test('createProductSchema rechaza colores fuera de la lista', () => {
  const result = createProductSchema.safeParse({
    ...base,
    variants: [{ talle: 'S', color: 'Verde', deposito: 1 }],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((i) => i.message).join(' '), /no está en la lista de colores/);
});

test('updateProductSchema rechaza variantes repetidas', () => {
  const result = updateProductSchema.safeParse({
    variants: [
      { talle: 'XL', color: 'Azul', deposito: 1 },
      { talle: 'XL', color: 'Azul', deposito: 2 },
    ],
  });
  assert.equal(result.success, false);
});

test('updateProductSchema acepta un update sin variantes', () => {
  const data = updateProductSchema.parse({ nombre: 'Remera nueva' });
  assert.equal(data.nombre, 'Remera nueva');
  assert.equal(data.variants, undefined);
});

test('updateProductSchema acepta lista de variantes vacía', () => {
  const data = updateProductSchema.parse({ variants: [] });
  assert.deepEqual(data.variants, []);
});
