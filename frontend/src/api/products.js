import api from './axios';

export const getProducts = (params) => api.get('/products', { params });
export const getProductByCodigo = (codigo) => api.get(`/products/codigo/${encodeURIComponent(codigo)}`);
export const getSiguienteCodigo = () => api.get('/products/siguiente-codigo');
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const addStock = (id, data) => api.put(`/products/${id}/add-stock`, data);
export const addDeposito = (id, data) => api.put(`/products/${id}/deposito`, data);
export const reponerStock = (id, data) => api.post(`/products/${id}/reponer`, data);
export const retirarStock = (id, data) => api.post(`/products/${id}/retirar`, data);
export const exchangeProduct = (data) => api.post('/products/exchange', data);
export const getLowStock = () => api.get('/products/low-stock');

