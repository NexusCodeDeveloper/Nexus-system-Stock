import api from './axios';

export const getReturns = () => api.get('/returns');
export const createReturn = (data) => api.post('/returns', data);
export const deleteReturn = (id) => api.delete(`/returns/${id}`);
