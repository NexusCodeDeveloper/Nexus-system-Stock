import api from './axios';

const conToken = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

export const suscribirPush = (subscription) => api.post('/push/suscribir', { subscription });
export const desuscribirPush = (endpoint, token) =>
  api.delete('/push/suscribir', { data: { endpoint }, ...conToken(token) });
