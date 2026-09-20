import api from './axios';

export const crearRetiroCaja = (data) => api.post('/retiros-caja', data);
export const obtenerRetirosCaja = (params) => api.get('/retiros-caja', { params });
export const obtenerDisponibleCaja = (params) => api.get('/retiros-caja/disponible', { params });
export const eliminarRetiroCaja = (id) => api.delete(`/retiros-caja/${id}`, { params: { offset: new Date().getTimezoneOffset() } });