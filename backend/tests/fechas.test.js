import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, getRange, startOfDayDate, clientTodayDate } from '../utils/fechas.js';

test('parseDate acepta fechas válidas', () => {
  const d = parseDate('2026-09-15');
  assert.equal(d.toISOString(), '2026-09-15T00:00:00.000Z');
});

test('parseDate rechaza formatos y fechas inválidas', () => {
  assert.equal(parseDate('15-09-2026'), null);
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
});

test('parseDate aplica el offset en minutos', () => {
  const d = parseDate('2026-09-15', 180);
  assert.equal(d.toISOString(), '2026-09-15T03:00:00.000Z');
});

test('getRange genera un rango de un día completo', () => {
  const { $gte, $lt } = getRange('2026-09-15', '2026-09-15');
  assert.equal($gte.toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal($lt.toISOString(), '2026-09-16T00:00:00.000Z');
});

test('getRange lanza error con fecha inválida', () => {
  assert.throws(() => getRange('mal', null), /Fecha inválida/);
  assert.throws(() => getRange(null, '2026-99-99'), /Fecha inválida/);
});

test('getRange sin extremos cubre todo el rango', () => {
  const { $gte, $lt } = getRange(null, null);
  assert.equal($gte.getTime(), 0);
  assert.ok($lt.getTime() > Date.now());
});

test('clientTodayDate y startOfDayDate respetan el offset', () => {
  const { y, m, d } = clientTodayDate(0);
  const hoy = new Date();
  assert.equal(y, hoy.getUTCFullYear());
  assert.equal(m, hoy.getUTCMonth() + 1);
  assert.equal(d, hoy.getUTCDate());

  const inicio = startOfDayDate(180);
  assert.equal(inicio.getUTCMinutes(), 0);
  assert.equal(inicio.getUTCSeconds(), 0);
});
