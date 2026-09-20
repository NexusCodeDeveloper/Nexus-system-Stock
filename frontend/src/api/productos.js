import api from './axios';

export const obtenerProductos = (params) => api.get('/productos', { params });
export const obtenerProducto = (id) => api.get(`/productos/${id}`);
export const obtenerProductoPorCodigo = (codigo) => api.get(`/productos/codigo/${encodeURIComponent(codigo)}`);
export const obtenerSiguienteCodigo = () => api.get('/productos/siguiente-codigo');
export const crearProducto = (data) => api.post('/productos', data);
export const actualizarProducto = (id, data) => api.put(`/productos/${id}`, data);
export const eliminarProducto = (id) => api.delete(`/productos/${id}`);
export const agregarStock = (id, data) => api.put(`/productos/${id}/agregar-stock`, data);
export const addDeposito = (id, data) => api.put(`/productos/${id}/deposito`, data);
export const reponerStock = (id, data) => api.post(`/productos/${id}/reponer`, data);
export const pasarSalon = (articulos) => api.post('/productos/pasar-salon', { articulos });
export const retirarStock = (id, data) => api.post(`/productos/${id}/retirar`, data);
export const intercambiarProducto = (data) => api.post('/productos/intercambio', data);
export const obtenerStockBajo = () => api.get('/productos/stock-bajo');

