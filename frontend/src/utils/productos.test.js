import { describe, expect, it } from 'vitest';
import { depositoTotal, salonTotal, variantLabel, tieneStockBajo, soloEnDeposito, paramsProductos, variantesParaEnviar } from './productos';

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

describe('soloEnDeposito', () => {
  it('marca true cuando el salón está en 0 y hay stock en depósito', () => {
    expect(soloEnDeposito({ cantidad: 0, deposito: 3 })).toBe(true);
  });

  it('suma las variantes', () => {
    expect(soloEnDeposito({
      variantes: [
        { cantidad: 0, deposito: 2 },
        { cantidad: 0, deposito: 1 },
      ],
    })).toBe(true);
  });

  it('no marca si queda stock en salón', () => {
    expect(soloEnDeposito({ cantidad: 1, deposito: 5 })).toBe(false);
  });

  it('no marca si no hay nada en depósito', () => {
    expect(soloEnDeposito({ cantidad: 0, deposito: 0 })).toBe(false);
  });
});

describe('variantesParaEnviar', () => {
  it('descarta filas totalmente vacías', () => {
    expect(variantesParaEnviar()).toEqual([]);
    expect(variantesParaEnviar([{ talle: '', color: '', deposito: '' }])).toEqual([]);
    expect(variantesParaEnviar([{ talle: '   ', color: '', deposito: 0 }])).toEqual([]);
  });

  it('mantiene filas con talle o cantidad y normaliza', () => {
    expect(variantesParaEnviar([
      { talle: ' M ', color: 'Azul', deposito: '3' },
      { talle: '', color: '', deposito: '5' },
      { talle: 'L', color: '', deposito: '' },
    ])).toEqual([
      { talle: 'M', color: 'Azul', deposito: 3 },
      { talle: '', color: '', deposito: 5 },
      { talle: 'L', color: '', deposito: 0 },
    ]);
  });
});

describe('paramsProductos', () => {
  it('devuelve undefined cuando no hay filtros', () => {
    expect(paramsProductos()).toBeUndefined();
    expect(paramsProductos({ search: '   ', categoria: '' })).toBeUndefined();
  });

  it('incluye la búsqueda recortada', () => {
    expect(paramsProductos({ search: '  remera ' })).toEqual({ search: 'remera' });
  });

  it('combina búsqueda y categoría', () => {
    expect(paramsProductos({ search: 'remera', categoria: 'Perro' })).toEqual({ search: 'remera', categoria: 'Perro' });
  });
});
