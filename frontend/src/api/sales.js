import api from './axios';

export const createSale = (data) => api.post('/sales', data);
export const getSales = (params) => api.get('/sales', { params });
export const getSalesStats = (params) => api.get('/sales/stats', { params });
export const getMostSold = (params) => api.get('/sales/most-sold', { params });
export const deleteSale = (id) => api.delete(`/sales/${id}`);
export const abrirCaja = (data) => api.post('/sales/caja/abrir', data);
export const getCajaAbierta = (params) => api.get('/sales/caja/abierta', { params });
export const cerrarCaja = (data) => api.post('/sales/caja/cerrar', data);
export const reabrirCaja = (data) => api.post('/sales/caja/reabrir', data);
export const getDailyCloses = (params) => api.get('/sales/daily-closes', { params });
export const deleteDailyClose = (id) => api.delete(`/sales/daily-closes/${id}`);
export const resendCloseMail = (id) => api.post(`/sales/daily-closes/${id}/resend-mail`, { offset: new Date().getTimezoneOffset() });
