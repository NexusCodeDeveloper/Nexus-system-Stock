import api from './axios';

export const obtenerDevoluciones = () => api.get('/devoluciones');
export const crearDevolucion = (data) => api.post('/devoluciones', data);
export const eliminarDevolucion = (id) => api.delete(`/devoluciones/${id}`);
