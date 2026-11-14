import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUTAS,
  construirAlertaStockBajo,
  construirEventoMovimientoStock,
  construirEventoMovimientoSalonMasivo,
  resumenArticulos,
  describirCambiosProducto,
  construirEventoProductoCreado,
  construirEventoProductoEditado,
  construirEventoProductoEliminado,
  construirEventoProductoRestaurado,
  construirEventoProductoEliminadoDefinitivo,
  construirEventoAumentoPrecios,
} from '../utils/NotificacionesUtils.js';

const productoConVariantes = (extra = {}) => ({
  _id: 'prod-1',
  nombre: 'Camisa Oxford',
  precio: 20000,
  cantidad: 2,
  deposito: 2,
  stockMinimo: 3,
  categoria: 'Camisas',
  proveedor: 'Proveedor Norte',
  colores: ['Azul', 'Negro'],
  variantes: [
    { talle: 'M', color: 'Azul', cantidad: 2, deposito: 2 },
    { talle: 'L', color: 'Negro', cantidad: 0, deposito: 0 },
  ],
  ...extra,
});

test('alerta de stock bajo informa cada variante y no solo el total', () => {
  const evento = construirAlertaStockBajo([productoConVariantes()]);

  assert.equal(evento.tipo, 'stock');
  assert.equal(evento.titulo, 'Stock bajo y sin stock');
  assert.equal(evento.url, RUTAS.PRODUCTOS);
  assert.equal(evento.para, 'admins');
  assert.match(evento.mensaje, /Camisa Oxford/);
  assert.match(evento.mensaje, /M \/ Azul: 2 u\. \(mín\. 3\)/);
  assert.match(evento.mensaje, /Dep: 2/);
  assert.match(evento.mensaje, /L \/ Negro: 0 u\./);
});

test('alerta de stock bajo distingue bajo, sin stock y sin alertas', () => {
  const bajo = construirAlertaStockBajo([
    { nombre: 'Remera', cantidad: 2, deposito: 0, stockMinimo: 3, variantes: [] },
  ]);
  assert.equal(bajo.titulo, 'Stock bajo');
  assert.match(bajo.mensaje, /Remera: 2 u\. \(mín\. 3\)/);

  const sinStock = construirAlertaStockBajo([
    { nombre: 'Gorra', cantidad: 0, deposito: 0, stockMinimo: 2, variantes: [] },
  ]);
  assert.equal(sinStock.titulo, 'Sin stock');

  assert.equal(
    construirAlertaStockBajo([
      { nombre: 'Buzo', cantidad: 8, deposito: 2, stockMinimo: 2, variantes: [] },
    ]),
    null
  );
});

test('alerta de stock bajo deduplica productos y limita el detalle', () => {
  const productos = [
    productoConVariantes(),
    productoConVariantes(),
    { nombre: 'Remera', cantidad: 1, deposito: 0, stockMinimo: 3, variantes: [] },
    { nombre: 'Gorra', cantidad: 1, deposito: 0, stockMinimo: 3, variantes: [] },
  ];
  const evento = construirAlertaStockBajo(productos);

  assert.equal((evento.mensaje.match(/Camisa Oxford/g) || []).length, 1);
  assert.match(evento.mensaje, /\+1 más/);
});

test('movimiento de stock de depósito informa variante, cantidad y stock resultante', () => {
  const producto = productoConVariantes({
    variantes: [{ talle: 'L', color: 'Azul', cantidad: 0, deposito: 7 }],
  });
  const evento = construirEventoMovimientoStock({
    tipo: 'ingreso_deposito',
    producto,
    talle: 'L',
    color: 'Azul',
    cantidad: 5,
    signo: '+',
    empleado: 'Sofía',
  });

  assert.equal(evento.titulo, 'Ingreso a depósito');
  assert.equal(evento.url, RUTAS.MOVIMIENTOS_STOCK);
  assert.match(evento.mensaje, /Camisa Oxford \(L \/ Azul\)/);
  assert.match(evento.mensaje, /\+5 u\./);
  assert.match(evento.mensaje, /Dep: 7/);
  assert.match(evento.mensaje, /Sofía/);
});

test('movimiento de stock de salón informa stock bajo o sin stock', () => {
  const producto = productoConVariantes({
    variantes: [{ talle: 'M', color: 'Azul', cantidad: 1, deposito: 2 }],
  });
  const evento = construirEventoMovimientoStock({
    tipo: 'retiro_deposito',
    producto,
    talle: 'M',
    color: 'Azul',
    cantidad: 2,
    empleado: 'Sofía',
  });

  assert.equal(evento.titulo, 'Retiro a depósito');
  assert.match(evento.mensaje, /Salón: 1/);
  assert.match(evento.mensaje, /Dep: 2/);
  assert.match(evento.mensaje, /bajo mínimo \(3\)/);
});

test('movimiento masivo a salón resume productos y unidades', () => {
  const evento = construirEventoMovimientoSalonMasivo({
    articulos: [
      { cantidad: 3, producto: { nombre: 'Camisa' } },
      { cantidad: 2, producto: { nombre: 'Gorra' } },
      { cantidad: 1, producto: { nombre: 'Buzo' } },
      { cantidad: 2, producto: { nombre: 'Remera' } },
    ],
    empleado: 'Sofía',
  });

  assert.equal(evento.titulo, 'Movimiento a salón');
  assert.match(evento.mensaje, /4 productos/);
  assert.match(evento.mensaje, /8 u\./);
  assert.match(evento.mensaje, /Camisa, Gorra, Buzo \+1/);
  assert.match(evento.mensaje, /Sofía/);
});

test('describe cambios de producto para la auditoría', () => {
  const previo = productoConVariantes();
  const actual = productoConVariantes({
    precio: 25000,
    stockMinimo: 5,
    categoria: 'Camisas premium',
    deposito: 4,
    colores: ['Azul', 'Verde'],
    variantes: [
      { talle: 'M', color: 'Azul', cantidad: 2, deposito: 4 },
      { talle: 'S', color: 'Verde', cantidad: 0, deposito: 0 },
    ],
  });
  const cambios = describirCambiosProducto(previo, actual);

  assert.ok(cambios.some((cambio) => /precio: \$20\.000,00 → \$25\.000,00/.test(cambio)));
  assert.ok(cambios.some((cambio) => /mínimo: 3 → 5/.test(cambio)));
  assert.ok(cambios.some((cambio) => /categoría: Camisas → Camisas premium/.test(cambio)));
  assert.ok(cambios.some((cambio) => /colores: \+Verde, -Negro/.test(cambio)));
  assert.ok(cambios.some((cambio) => /variantes: \+S \/ Verde, -L \/ Negro/.test(cambio)));
  assert.ok(cambios.some((cambio) => /depósito M \/ Azul: 2 → 4/.test(cambio)));
});

test('no describe cambios cuando el producto queda igual', () => {
  assert.deepEqual(describirCambiosProducto(productoConVariantes(), productoConVariantes()), []);
});

test('eventos de creación y edición de producto usan la ruta de productos', () => {
  const creado = construirEventoProductoCreado(productoConVariantes(), 'Tomás');
  assert.equal(creado.titulo, 'Producto creado');
  assert.equal(creado.url, RUTAS.PRODUCTOS);
  assert.match(creado.mensaje, /2 variantes/);
  assert.match(creado.mensaje, /\$20\.000,00/);

  const editado = construirEventoProductoEditado({
    producto: productoConVariantes(),
    cambios: ['precio: $20.000,00 → $25.000,00', 'mínimo: 3 → 5', 'depósito: 2 → 4', 'salón: 2 → 3'],
    empleado: 'Tomás',
  });
  assert.equal(editado.titulo, 'Producto editado');
  assert.match(editado.mensaje, /\+1 cambios/);
  assert.match(editado.mensaje, /Tomás/);
});

test('eventos de papelera y restauración usan la ruta correcta', () => {
  assert.equal(construirEventoProductoEliminado(productoConVariantes(), 'Tomás').url, RUTAS.PAPELERA);
  assert.equal(construirEventoProductoRestaurado(productoConVariantes(), 'Tomás').url, RUTAS.PRODUCTOS);
  assert.equal(
    construirEventoProductoEliminadoDefinitivo(productoConVariantes(), 'Tomás').titulo,
    'Producto eliminado definitivo'
  );
});

test('eventos de aumento masivo informan cantidad, valor y ruta de depósito', () => {
  const items = [
    { nombre: 'Camisa' },
    { nombre: 'Buzo' },
    { nombre: 'Gorra' },
    { nombre: 'Remera' },
  ];
  const aplicado = construirEventoAumentoPrecios({
    items,
    tipo: 'porcentaje',
    valor: 10,
    empleado: 'Tomás',
  });
  assert.equal(aplicado.titulo, 'Aumento de precios');
  assert.equal(aplicado.url, RUTAS.DEPOSITO);
  assert.match(aplicado.mensaje, /4 productos · \+10% · Camisa, Buzo, Gorra \+1 · Tomás/);

  const deshecho = construirEventoAumentoPrecios({
    items,
    tipo: 'monto',
    valor: 1500,
    empleado: 'Tomás',
    deshecho: true,
  });
  assert.equal(deshecho.titulo, 'Aumento deshecho');
  assert.match(deshecho.mensaje, /4 productos · \$1\.500,00/);
});

test('resumen de artículos incluye variantes y limita el detalle', () => {
  assert.equal(
    resumenArticulos([
      { nombre: 'Camisa', cantidad: 2, talle: 'M', color: 'Azul' },
      { nombre: 'Gorra', cantidad: 1 },
    ]),
    '2 Camisa (M / Azul) + 1 Gorra'
  );
  assert.equal(
    resumenArticulos([
      { nombre: 'Uno', cantidad: 1 },
      { nombre: 'Dos', cantidad: 1 },
      { nombre: 'Tres', cantidad: 1 },
      { nombre: 'Cuatro', cantidad: 1 },
    ]),
    '1 Uno + 1 Dos + 1 Tres +1 más'
  );
});
