import webpush from 'web-push';
import PushSubscription from '../modules/Push/PushModel.js';

const configurado = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (configurado()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@nexus.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export const registrarSuscripcion = async ({ endpoint, keys }, user) => {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    const err = new Error('Suscripción inválida');
    err.statusCode = 400;
    throw err;
  }
  await PushSubscription.updateOne(
    { endpoint },
    {
      $set: {
        endpoint,
        'keys.p256dh': keys.p256dh,
        'keys.auth': keys.auth,
        email: user.email || '',
        nombre: user.nombre || '',
        rol: user.rol || 'user',
        actualizadoAt: new Date(),
      },
    },
    { upsert: true }
  );
};

export const eliminarSuscripcion = async (endpoint) => {
  await PushSubscription.deleteOne({ endpoint });
};

const construirFiltro = (para) => {
  if (para === 'admins') return { rol: 'admin' };
  if (para === 'empleados') return { rol: 'user' };
  if (para?.empleado) return { $or: [{ rol: 'admin' }, { nombre: para.empleado }] };
  return {};
};

export const enviarEvento = async ({ tipo, titulo, mensaje, url = '/', para = 'todos' }) => {
  if (!configurado()) return;
  try {
    const subs = await PushSubscription.find(construirFiltro(para));
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
        if (code === 404 || code === 410) eliminar.push(s._id);
      }
    });
    if (eliminar.length > 0) {
      await PushSubscription.deleteMany({ _id: { $in: eliminar } });
    }
  } catch (error) {
    console.error('[Push] Error al enviar evento:', error.message);
  }
};

export const enviarStockBajo = async (productos = []) => {
  if (!configurado() || productos.length === 0) return;
  const stockDe = (p) =>
    p.variants?.length > 0 ? p.variants.reduce((s, v) => s + v.cantidad, 0) : p.cantidad;
  const agotados = productos.filter((p) => stockDe(p) <= (p.stockMinimo ?? 0));
  if (agotados.length === 0) return;
  await enviarEvento({
    tipo: 'stock',
    titulo: 'Stock bajo',
    mensaje: agotados.map((p) => `${p.nombre} (${stockDe(p)} uds.)`).join(' · '),
    url: '/products',
    para: 'admins',
  });
};