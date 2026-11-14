import test from 'node:test';
import assert from 'node:assert/strict';
import { construirPayloadPush } from '../services/PushService.js';

test('el push usa el título del evento en lugar del nombre del local', () => {
  const payload = JSON.parse(
    construirPayloadPush({
      tipo: 'venta',
      titulo: 'Empleado Uno vendió $20.000,00',
      mensaje: 'Ticket T-ABC12345 · $20.000,00',
      url: '/ventas',
      fecha: '2026-01-01T00:00:00.000Z',
    })
  );

  assert.equal(payload.tipo, 'venta');
  assert.equal(payload.titulo, 'Empleado Uno vendió $20.000,00');
  assert.equal(payload.mensaje, 'Ticket T-ABC12345 · $20.000,00');
  assert.equal(payload.url, '/ventas');
});

test('el push usa un título genérico si el evento no trae título', () => {
  const payload = JSON.parse(
    construirPayloadPush({
      tipo: 'evento',
      mensaje: 'Detalle',
      fecha: '2026-01-01T00:00:00.000Z',
    })
  );

  assert.equal(payload.titulo, 'Notificación');
});
