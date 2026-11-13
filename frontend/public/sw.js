// Service worker de Sistema de Stock — SOLO notificaciones push.
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
    body: data.mensaje || 'Nuevo movimiento',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/', tipo: data.tipo || 'evento' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.titulo || 'Sistema de Stock', options);
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
          const destino = new URL(url, self.location.origin);
          const actual = new URL(client.url);
          if ('navigate' in client && (destino.pathname !== actual.pathname || destino.search !== actual.search)) {
            await client.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});