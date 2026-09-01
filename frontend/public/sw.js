// Service worker de NexusCode — SOLO notificaciones push.
// NO usa cache de respuestas: no interfiere con la carga de la app.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const options = {
    body: data.mensaje || 'Nuevo movimiento en NexusCode',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/', tipo: data.tipo || 'evento' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.titulo || 'NexusCode', options);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'push', payload: data });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url !== new URL(client.url).pathname) {
            await client.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});