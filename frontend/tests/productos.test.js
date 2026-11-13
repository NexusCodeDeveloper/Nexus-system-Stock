import { describe, expect, it } from 'vitest';
import { depositoTotal, salonTotal, variantLabel, estadoStock, estadoStockProducto, estadoStockVariante, soloEnDeposito, paramsProductos, variantesParaEnviar } from '../src/utils/productos';

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

describe('estadoStock', () => {
  it('marca agotado cuando no hay unidades aunque no haya mínimo', () => {
    expect(estadoStock(0, null)).toBe('agotado');
    expect(estadoStock(0, undefined)).toBe('agotado');
    expect(estadoStock(0, 2)).toBe('agotado');
  });

  it('marca bajo cuando hay stock pero no supera el mínimo', () => {
    expect(estadoStock(1, 2)).toBe('bajo');
    expect(estadoStock(2, 2)).toBe('bajo');
    expect(estadoStock('1', '2')).toBe('bajo');
  });

  it('no marca por encima del mínimo ni sin mínimo definido', () => {
    expect(estadoStock(3, 2)).toBeNull();
    expect(estadoStock(5, null)).toBeNull();
    expect(estadoStock(5)).toBeNull();
  });
});

describe('estadoStockProducto', () => {
  it('usa el stock general cuando no hay variantes', () => {
    expect(estadoStockProducto({ cantidad: 0, stockMinimo: 2 })).toBe('agotado');
    expect(estadoStockProducto({ cantidad: 1, stockMinimo: 2 })).toBe('bajo');
    expect(estadoStockProducto({ cantidad: 3, stockMinimo: 2 })).toBeNull();
    expect(estadoStockProducto({ cantidad: 0 })).toBe('agotado');
  });

  it('no marca el producto si sólo una variante está agotada', () => {
    const producto = {
      stockMinimo: 2,
      variantes: [
        { talle: 'M', cantidad: 0 },
        { talle: 'L', cantidad: 10 },
      ],
    };
    expect(estadoStockProducto(producto)).toBeNull();
  });

  it('marca el producto agotado cuando todas las variantes están en 0', () => {
    const producto = {
      stockMinimo: 2,
      variantes: [
        { talle: 'M', cantidad: 0 },
        { talle: 'L', cantidad: 0 },
      ],
    };
    expect(estadoStockProducto(producto)).toBe('agotado');
  });
});

describe('estadoStockVariante', () => {
  it('evalúa cada variante con el mínimo del producto', () => {
    expect(estadoStockVariante({ cantidad: 0 }, 2)).toBe('agotado');
    expect(estadoStockVariante({ cantidad: 1 }, 2)).toBe('bajo');
    expect(estadoStockVariante({ cantidad: 5 }, 2)).toBeNull();
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
