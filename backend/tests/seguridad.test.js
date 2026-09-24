import test from 'node:test';
import assert from 'node:assert/strict';
import { validarEndpointPush, construirFiltro } from '../services/PushService.js';
import { construirReporte } from '../modules/ReporteError/ReporteErrorController.js';
import { conReintentos, esErrorTransitorio } from '../utils/TransaccionesUtils.js';

test('conReintentos reintenta solo los errores transitorios', async () => {
  let intentos = 0;
  const resultado = await conReintentos(async () => {
    intentos += 1;
    if (intentos < 3) {
      const error = new Error('write conflict');
      error.code = 112;
      throw error;
    }
    return 'ok';
  });
  assert.equal(resultado, 'ok');
  assert.equal(intentos, 3);

  let intentosNoTransitorio = 0;
  await assert.rejects(
    () =>
      conReintentos(async () => {
        intentosNoTransitorio += 1;
        throw new Error('error de negocio');
      }),
    /error de negocio/
  );
  assert.equal(intentosNoTransitorio, 1);

  assert.equal(esErrorTransitorio({ code: 112 }), true);
  assert.equal(esErrorTransitorio({ hasErrorLabel: (l) => l === 'TransientTransactionError' }), true);
  assert.equal(esErrorTransitorio(new Error('x')), false);
});

test('validarEndpointPush acepta servicios de push conocidos', () => {
  assert.equal(validarEndpointPush('https://fcm.googleapis.com/fcm/send/abc123'), true);
  assert.equal(validarEndpointPush('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(validarEndpointPush('https://web.push.apple.com/xyz'), true);
  assert.equal(validarEndpointPush('https://wns2-par02p.notify.windows.com/w/?token=abc'), true);
});

test('validarEndpointPush rechaza http, hosts internos y endpoints largos', () => {
  assert.equal(validarEndpointPush('http://fcm.googleapis.com/fcm/send/abc'), false);
  assert.equal(validarEndpointPush('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(validarEndpointPush('https://127.0.0.1:8443/x'), false);
  assert.equal(validarEndpointPush('https://localhost/push'), false);
  assert.equal(validarEndpointPush('https://interno.local/push'), false);
  assert.equal(validarEndpointPush(`https://fcm.googleapis.com/${'a'.repeat(1100)}`), false);
  assert.equal(validarEndpointPush('no-es-una-url'), false);
  assert.equal(validarEndpointPush(''), false);
});

test('construirFiltro dirigido no incluye admins ni fallback por nombre', () => {
  assert.deepEqual(construirFiltro({ usuarioId: 'abc123', nombre: 'Juan' }), { usuarioId: 'abc123' });
  assert.deepEqual(construirFiltro('admins'), { rol: 'admin' });
  assert.deepEqual(construirFiltro('empleados'), { rol: 'user' });
  assert.deepEqual(construirFiltro('todos'), {});
});

test('construirReporte no confía en el usuario del body y sanitiza el stack', () => {
  const req = { id: 'req-1', headers: { 'user-agent': 'Mozilla' }, ip: '::1' };
  const reporte = construirReporte(
    {
      mensaje: 'boom',
      stack: 'Error: boom\n    at foo\n\u001b[31mrojo',
      contexto: { usuario: 'admin@nexus.com' },
    },
    req
  );

  assert.equal(reporte.quien, 'anonimo');
  assert.ok(!reporte.stack.includes('\n'), 'el stack no debe conservar saltos de línea');
  assert.ok(!reporte.stack.includes('\u001b'), 'el stack no debe conservar secuencias ANSI');
});
