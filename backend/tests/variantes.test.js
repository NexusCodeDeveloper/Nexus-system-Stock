import test from 'node:test';
import assert from 'node:assert/strict';
import { encontrarVariante, indiceDeVariante, depositoDe, extraDeposito } from '../utils/VariantesUtils.js';
import {
  asegurarCodigosVariante,
  esCodigoDeVarianteDe,
  faltanCodigosDeVariante,
  sufijoDeCodigo,
  variantePorCodigo,
} from '../utils/CodigosVarianteUtils.js';

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

test('esCodigoDeVarianteDe valida formato y producto', () => {
  assert.equal(esCodigoDeVarianteDe('NC-000123-01', 'NC-000123'), true);
  assert.equal(esCodigoDeVarianteDe('nc-000123-01', 'NC-000123'), true);
  assert.equal(esCodigoDeVarianteDe('NC-000123-01', 'NC-000124'), false);
  assert.equal(esCodigoDeVarianteDe('NC-000123', 'NC-000123'), false);
  assert.equal(esCodigoDeVarianteDe('', 'NC-000123'), false);
});

test('sufijoDeCodigo extrae el sufijo numérico', () => {
  assert.equal(sufijoDeCodigo('NC-000123-07'), 7);
  assert.equal(sufijoDeCodigo('NC-000123-99'), 99);
  assert.equal(sufijoDeCodigo('NC-000123'), 0);
  assert.equal(sufijoDeCodigo('cualquiera'), 0);
});

test('asegurarCodigosVariante asigna códigos correlativos a variantes nuevas', () => {
  const producto = {
    nombre: 'Remera',
    codigo: 'nc-000123',
    variantes: [
      { talle: 'S', color: 'Azul' },
      { talle: 'M', color: 'Azul' },
    ],
  };
  assert.equal(asegurarCodigosVariante(producto), true);
  assert.equal(producto.variantes[0].codigo, 'NC-000123-01');
  assert.equal(producto.variantes[1].codigo, 'NC-000123-02');
  assert.equal(producto.siguienteSufijoVariante, 3);
});

test('asegurarCodigosVariante conserva códigos existentes y no reutiliza sufijos liberados', () => {
  const producto = {
    nombre: 'Remera',
    codigo: 'NC-000123',
    siguienteSufijoVariante: 5,
    variantes: [
      { talle: 'S', color: 'Azul', codigo: 'nc-000123-02' },
      { talle: 'M', color: 'Azul' },
    ],
  };
  asegurarCodigosVariante(producto);
  assert.equal(producto.variantes[0].codigo, 'NC-000123-02');
  assert.equal(producto.variantes[1].codigo, 'NC-000123-05');
  assert.equal(producto.siguienteSufijoVariante, 6);
});

test('asegurarCodigosVariante reasigna códigos repetidos o de otro producto', () => {
  const producto = {
    nombre: 'Remera',
    codigo: 'NC-000123',
    variantes: [
      { talle: 'S', color: 'Azul', codigo: 'NC-000123-01' },
      { talle: 'M', color: 'Azul', codigo: 'NC-000123-01' },
      { talle: 'L', color: 'Azul', codigo: 'NC-000999-01' },
    ],
  };
  asegurarCodigosVariante(producto);
  assert.equal(producto.variantes[0].codigo, 'NC-000123-01');
  assert.equal(producto.variantes[1].codigo, 'NC-000123-02');
  assert.equal(producto.variantes[2].codigo, 'NC-000123-03');
});

test('asegurarCodigosVariante falla con más de 99 variantes sin código', () => {
  const producto = {
    nombre: 'Remera',
    codigo: 'NC-000123',
    siguienteSufijoVariante: 99,
    variantes: [
      { talle: 'A', color: '' },
      { talle: 'B', color: '' },
    ],
  };
  assert.throws(() => asegurarCodigosVariante(producto), /99/);
});

test('faltanCodigosDeVariante detecta variantes legacy sin código', () => {
  assert.equal(faltanCodigosDeVariante({ codigo: 'NC-000123', variantes: [] }), false);
  assert.equal(
    faltanCodigosDeVariante({ codigo: 'NC-000123', variantes: [{ talle: 'S', color: '' }] }),
    true
  );
  assert.equal(
    faltanCodigosDeVariante({
      codigo: 'NC-000123',
      variantes: [{ talle: 'S', color: '', codigo: 'NC-000123-01' }],
    }),
    false
  );
});

test('variantePorCodigo encuentra la variante exacta', () => {
  const producto = {
    variantes: [
      { talle: 'S', color: 'Azul', codigo: 'NC-000123-01' },
      { talle: 'M', color: 'Azul', codigo: 'NC-000123-02' },
    ],
  };
  assert.equal(variantePorCodigo(producto, 'nc-000123-02').talle, 'M');
  assert.equal(variantePorCodigo(producto, 'NC-000123-09'), null);
  assert.equal(variantePorCodigo({ variantes: [] }, 'NC-000123-01'), null);
});
