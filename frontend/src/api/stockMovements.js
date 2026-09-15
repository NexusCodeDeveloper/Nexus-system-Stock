import api from './axios';

export const getStockMovements = (params) => api.get('/stock-movements', { params });
