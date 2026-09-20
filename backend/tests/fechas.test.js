import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearFecha, obtenerRango, inicioDeDia, fechaHoyCliente } from '../utils/FechasUtils.js';

test('parsearFecha acepta fechas válidas', () => {
  const d = parsearFecha('2026-09-15');
  assert.equal(d.toISOString(), '2026-09-15T00:00:00.000Z');
});

test('parsearFecha rechaza formatos y fechas inválidas', () => {
  assert.equal(parsearFecha('15-09-2026'), null);
  assert.equal(parsearFecha('2026-02-30'), null);
  assert.equal(parsearFecha('2026-13-01'), null);
  assert.equal(parsearFecha(''), null);
  assert.equal(parsearFecha(null), null);
});

test('parsearFecha aplica el offset en minutos', () => {
  const d = parsearFecha('2026-09-15', 180);
  assert.equal(d.toISOString(), '2026-09-15T03:00:00.000Z');
});

test('obtenerRango genera un rango de un día completo', () => {
  const { $gte, $lt } = obtenerRango('2026-09-15', '2026-09-15');
  assert.equal($gte.toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal($lt.toISOString(), '2026-09-16T00:00:00.000Z');
});

test('obtenerRango lanza error con fecha inválida', () => {
  assert.throws(() => obtenerRango('mal', null), /Fecha inválida/);
  assert.throws(() => obtenerRango(null, '2026-99-99'), /Fecha inválida/);
});

test('obtenerRango sin extremos cubre todo el rango', () => {
  const { $gte, $lt } = obtenerRango(null, null);
  assert.equal($gte.getTime(), 0);
  assert.ok($lt.getTime() > Date.now());
});

test('fechaHoyCliente y inicioDeDia respetan el offset', () => {
  const { y, m, d } = fechaHoyCliente(0);
  const hoy = new Date();
  assert.equal(y, hoy.getUTCFullYear());
  assert.equal(m, hoy.getUTCMonth() + 1);
  assert.equal(d, hoy.getUTCDate());

  const inicio = inicioDeDia(180);
  assert.equal(inicio.getUTCMinutes(), 0);
  assert.equal(inicio.getUTCSeconds(), 0);
});
