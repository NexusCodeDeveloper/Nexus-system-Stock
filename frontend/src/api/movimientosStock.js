import api from './axios';

export const obtenerMovimientosStock = (params) => api.get('/movimientos-stock', { params });
