import { suscribirPush, desuscribirPush } from '../api/push';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const SW_READY_TIMEOUT = 5000;

export const pushSoportado = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  Boolean(VAPID_KEY) &&
  window.isSecureContext;

export const registrarServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      if (import.meta.env.DEV) console.warn('[Push] No se pudo registrar el service worker:', error.message);
    });
  });
};

const esperarServiceWorker = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('service worker timeout')), SW_READY_TIMEOUT)
    ),
  ]);

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

export const getPushEstado = async () => {
  if (!pushSoportado()) return { soportado: false };
  try {
    const permiso = Notification.permission;
    const reg = await esperarServiceWorker();
    const sub = await reg.pushManager.getSubscription();
    return { soportado: true, permiso, suscrito: Boolean(sub) };
  } catch {
    return { soportado: false };
  }
};

export const activarPush = async () => {
  if (!pushSoportado()) return { ok: false, motivo: 'unsupported' };
  let permiso;
  try {
    permiso = await Notification.requestPermission();
  } catch {
    return { ok: false, motivo: 'error' };
  }
  if (permiso !== 'granted') return { ok: false, motivo: permiso };
  try {
    const reg = await esperarServiceWorker();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
    }
    await suscribirPush(sub.toJSON());
    return { ok: true };
  } catch {
    return { ok: false, motivo: 'error' };
  }
};

export const desactivarPush = async () => {
  if (!pushSoportado()) return;
  try {
    const reg = await esperarServiceWorker();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await desuscribirPush(endpoint);
    }
  } catch {
    /* silencioso */
  }
};

export const escucharPush = (callback) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const handler = (event) => {
    if (event.data?.type === 'push') {
      callback(event.data.payload || {});
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
};
