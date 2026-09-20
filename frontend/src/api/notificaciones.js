import api from './axios';

export const obtenerNotificaciones = () => api.get('/notificaciones');
export const crearNotificacion = (data) => api.post('/notificaciones', data);
export const actualizarNotificacion = (id, data) => api.put(`/notificaciones/${id}`, data);
export const eliminarNotificacion = (id) => api.delete(`/notificaciones/${id}`);
export const completarNotificacion = (id, data) => api.patch(`/notificaciones/${id}/completar`, data);
export const reabrirNotificacion = (id) => api.patch(`/notificaciones/${id}/reabrir`);
export const marcarVistasAdminApi = () => api.patch('/notificaciones/marcar-vistas-admin');