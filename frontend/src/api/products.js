import api from './axios';

export const getProducts = (params) => api.get('/products', { params });
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const sellProduct = (id, data) => api.put(`/products/${id}/sell`, data);
export const addStock = (id, data) => api.put(`/products/${id}/add-stock`, data);
export const exchangeProduct = (data) => api.post('/products/exchange', data);
export const getLowStock = () => api.get('/products/low-stock');

