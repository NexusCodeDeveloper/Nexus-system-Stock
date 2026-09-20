import api from './axios';

export const crearVenta = (data) => api.post('/ventas', data);
export const obtenerVentas = (params) => api.get('/ventas', { params });
export const obtenerEstadisticasVentas = (params) => api.get('/ventas/stats', { params });
export const obtenerMasVendidos = (params) => api.get('/ventas/mas-vendidos', { params });
export const eliminarVenta = (id) => api.delete(`/ventas/${id}`);
export const abrirCaja = (data) => api.post('/ventas/caja/abrir', data);
export const obtenerCajaAbierta = (params) => api.get('/ventas/caja/abierta', { params });
export const cerrarCaja = (data) => api.post('/ventas/caja/cerrar', data);
export const reabrirCaja = (data) => api.post('/ventas/caja/reabrir', data);
export const obtenerCierresCaja = (params) => api.get('/ventas/cierres-caja', { params });
export const eliminarCierreCaja = (id) => api.delete(`/ventas/cierres-caja/${id}`);
export const reenviarCorreoCierre = (id) => api.post(`/ventas/cierres-caja/${id}/reenviar-mail`, { offset: new Date().getTimezoneOffset() });
