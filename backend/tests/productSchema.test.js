import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaCrearProducto, schemaActualizarProducto } from '../modules/Producto/ProductoSchema.js';

const base = {
  nombre: 'Remera',
  precio: 1000,
  categoria: 'Indumentaria',
};

test('schemaCrearProducto acepta variantes únicas', () => {
  const data = schemaCrearProducto.parse({
    ...base,
    variantes: [
      { talle: 'S', color: 'Rojo', deposito: 2 },
      { talle: 'M', color: 'Rojo', deposito: 3 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(data.variantes.length, 2);
});

test('schemaCrearProducto rechaza variantes repetidas (talle+color)', () => {
  const result = schemaCrearProducto.safeParse({
    ...base,
    variantes: [
      { talle: 'S', color: 'Rojo', deposito: 2 },
      { talle: 'S', color: 'Rojo', deposito: 5 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((i) => i.message).join(' '), /repetida/);
});

test('schemaCrearProducto tolera diferencias de mayúsculas/espacios al detectar repetidas', () => {
  const result = schemaCrearProducto.safeParse({
    ...base,
    variantes: [
      { talle: 's', color: 'Rojo', deposito: 1 },
      { talle: 'S ', color: ' rojo', deposito: 1 },
    ],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
});

test('schemaCrearProducto rechaza colores fuera de la lista', () => {
  const result = schemaCrearProducto.safeParse({
    ...base,
    variantes: [{ talle: 'S', color: 'Verde', deposito: 1 }],
    colores: ['Rojo'],
  });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((i) => i.message).join(' '), /no está en la lista de colores/);
});

test('schemaActualizarProducto rechaza variantes repetidas', () => {
  const result = schemaActualizarProducto.safeParse({
    variantes: [
      { talle: 'XL', color: 'Azul', deposito: 1 },
      { talle: 'XL', color: 'Azul', deposito: 2 },
    ],
  });
  assert.equal(result.success, false);
});

test('schemaActualizarProducto acepta un update sin variantes', () => {
  const data = schemaActualizarProducto.parse({ nombre: 'Remera nueva' });
  assert.equal(data.nombre, 'Remera nueva');
  assert.equal(data.variantes, undefined);
});

test('schemaActualizarProducto acepta lista de variantes vacía', () => {
  const data = schemaActualizarProducto.parse({ variantes: [] });
  assert.deepEqual(data.variantes, []);
});
