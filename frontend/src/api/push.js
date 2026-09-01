import api from './axios';

export const subscribePush = (subscription) => api.post('/push/subscribe', { subscription });
export const unsubscribePush = (endpoint) => api.delete('/push/subscribe', { data: { endpoint } });