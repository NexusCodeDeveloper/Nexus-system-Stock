import api from './axios';

export const suscribirPush = (subscription) => api.post('/push/suscribir', { subscription });
export const desuscribirPush = (endpoint) => api.delete('/push/suscribir', { data: { endpoint } });