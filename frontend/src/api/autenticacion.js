import api from './axios';

export const iniciarSesion = (data) => api.post('/auth/login', data);
export const obtenerPerfil = () => api.get('/auth/me');
