import api from './axios';

export const salesLogin = (data) => api.post('/sales-auth/login', data);
export const createSale = (data) => api.post('/sales', data);
export const getSales = (params) => api.get('/sales', { params });
export const getTickets = (params) => api.get('/sales', { params });
export const getSalesStats = (params) => api.get('/sales/stats', { params });
export const getMostSold = (params) => api.get('/sales/most-sold', { params });
export const deleteSale = (id) => api.delete(`/sales/${id}`);
export const getDailyClose = (data) => api.post('/sales/daily-close', data);
export const getDailyCloses = (params) => api.get('/sales/daily-closes', { params });
export const deleteDailyClose = (id) => api.delete(`/sales/daily-closes/${id}`);
export const resendCloseMail = (id) => api.post(`/sales/daily-closes/${id}/resend-mail`);
