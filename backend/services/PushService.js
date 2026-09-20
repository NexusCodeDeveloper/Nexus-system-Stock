import webpush from 'web-push';
import SuscripcionPush from '../modules/Push/PushModel.js';
import logger from '../utils/LoggerUtils.js';

let pushActivo = false;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@nexus.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    pushActivo = true;
  } catch (error) {
    logger.warn('Claves VAPID inválidas: notificaciones push desactivadas', {
      motivo: error.message,
      queRevisar: 'Generá claves nuevas con "npx web-push generate-vapid-keys" o dejá VAPID vacío para desactivar el push.',
      origen: 'backend',
      lugar: 'PushService.js',
    });
  }
}

export const registrarSuscripcion = async ({ endpoint, keys }, usuario) => {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    const err = new Error('Suscripción inválida');
    err.statusCode = 400;
    throw err;
  }
  await SuscripcionPush.updateOne(
    { endpoint },
    {
      $set: {
        endpoint,
        'keys.p256dh': keys.p256dh,
        'keys.auth': keys.auth,
        email: usuario.email || '',
        nombre: usuario.nombre || '',
        usuarioId: usuario.id || null,
        rol: usuario.rol || 'user',
        actualizadoAt: new Date(),
      },
    },
    { upsert: true }
  );
};

export const eliminarSuscripcion = async (endpoint, usuarioId) => {
  const filtro = usuarioId
    ? { endpoint, $or: [{ usuarioId }, { usuarioId: null }, { usuarioId: { $exists: false } }] }
    : { endpoint };
  await SuscripcionPush.deleteOne(filtro);
};

const construirFiltro = (para) => {
  if (para === 'admins') return { rol: 'admin' };
  if (para === 'empleados') return { rol: 'user' };
  if (para?.usuarioId) {
    return {
      $or: [
        { rol: 'admin' },
        { usuarioId: para.usuarioId },
        { usuarioId: { $exists: false }, nombre: para.nombre || '' },
      ],
    };
  }
  return {};
};

export const enviarEvento = async ({ tipo, titulo, mensaje, url = '/', para = 'todos' }) => {
  if (!pushActivo) return;
  try {
    const subs = await SuscripcionPush.find(construirFiltro(para));
    if (subs.length === 0) return;

    const payload = JSON.stringify({
      tipo,
      titulo,
      mensaje,
      url,
      fecha: new Date().toISOString(),
    });

    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          payload
        )
      )
    );

    const eliminar = [];
    subs.forEach((s, i) => {
      const r = resultados[i];
      if (r.status === 'rejected') {
        const code = r.reason?.statusCode;
        if (code === 404 || code === 410) {
          eliminar.push(s._id);
        } else {
          logger.warn('No se pudo enviar una notificación push', {
            motivo: r.reason?.message || 'Error desconocido',
            codigo: code,
            destino: String(s.endpoint || '').slice(0, 80),
            origen: 'backend',
            lugar: 'PushService.js',
          });
        }
      }
    });
    if (eliminar.length > 0) {
      await SuscripcionPush.deleteMany({ _id: { $in: eliminar } });
    }
  } catch (error) {
    logger.error('No se pudo enviar la notificación push', {
      motivo: error.message,
      queRevisar: 'Revisá las claves VAPID y la conexión del servidor.',
      origen: 'backend',
      lugar: 'PushService.js',
      stack: error.stack,
    });
  }
};

export const enviarStockBajo = async (productos = []) => {
  if (!pushActivo || productos.length === 0) return;
  const stockDe = (p) =>
    p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + v.cantidad, 0) : p.cantidad;
  const depositoDe = (p) =>
    p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (v.deposito || 0), 0) : (p.deposito || 0);
  const agotados = productos.filter((p) => stockDe(p) <= (p.stockMinimo ?? 0));
  if (agotados.length === 0) return;
  await enviarEvento({
    tipo: 'stock',
    titulo: 'Stock bajo',
    mensaje: agotados
      .map((p) => {
        const dep = depositoDe(p);
        return `${p.nombre} (${stockDe(p)} uds.${dep > 0 ? ` · dep ${dep}` : ''})`;
      })
      .join(' · '),
    url: '/products',
    para: 'admins',
  });
};
