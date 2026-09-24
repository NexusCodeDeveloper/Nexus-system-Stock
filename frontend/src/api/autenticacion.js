import api from './axios';

const conToken = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

export const iniciarSesion = (data) => api.post('/auth/login', data);
export const cerrarSesion = (token) => api.post('/auth/logout', null, conToken(token));
export const obtenerPerfil = () => api.get('/auth/me');
