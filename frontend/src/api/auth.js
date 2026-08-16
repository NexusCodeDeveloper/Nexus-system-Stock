import api from './axios';

export const loginUser = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
