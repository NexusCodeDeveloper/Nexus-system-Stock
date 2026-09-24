import { describe, expect, it } from 'vitest';
import { depositoTotal, salonTotal, variantLabel, tieneStockBajo } from './productos';

describe('depositoTotal y salonTotal', () => {
  it('suman las variantes cuando existen', () => {
    const producto = {
      cantidad: 99,
      deposito: 99,
      variantes: [
        { talle: 'M', color: '', cantidad: 2, deposito: 3 },
        { talle: 'L', color: '', cantidad: 1, deposito: 4 },
      ],
    };
    expect(depositoTotal(producto)).toBe(7);
    expect(salonTotal(producto)).toBe(3);
  });

  it('usan el stock general cuando no hay variantes', () => {
    const producto = { cantidad: 5, deposito: 2, variantes: [] };
    expect(depositoTotal(producto)).toBe(2);
    expect(salonTotal(producto)).toBe(5);
  });
});

describe('tieneStockBajo', () => {
  it('detecta una variante agotada aunque el total no sea bajo', () => {
    const producto = {
      stockMinimo: 2,
      variantes: [
        { talle: 'M', cantidad: 0 },
        { talle: 'L', cantidad: 10 },
      ],
    };
    expect(tieneStockBajo(producto)).toBe(true);
  });

  it('no marca stock bajo si todas las variantes están por encima', () => {
    const producto = {
      stockMinimo: 2,
      variantes: [
        { talle: 'M', cantidad: 3 },
        { talle: 'L', cantidad: 10 },
      ],
    };
    expect(tieneStockBajo(producto)).toBe(false);
  });

  it('compara el stock general cuando no hay variantes', () => {
    expect(tieneStockBajo({ stockMinimo: 2, cantidad: 2 })).toBe(true);
    expect(tieneStockBajo({ stockMinimo: 2, cantidad: 3 })).toBe(false);
    expect(tieneStockBajo({ cantidad: 0 })).toBe(false);
  });
});

describe('variantLabel', () => {
  it('combina talle y color', () => {
    expect(variantLabel({ talle: 'M', color: 'Rojo' })).toBe('M / Rojo');
    expect(variantLabel({ talle: 'M', color: '' })).toBe('M');
    expect(variantLabel({})).toBe('Base');
  });
});
