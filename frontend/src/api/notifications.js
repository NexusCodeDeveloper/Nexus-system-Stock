import api from './axios';

export const getNotifications = () => api.get('/notifications');
export const createNotification = (data) => api.post('/notifications', data);
export const updateNotification = (id, data) => api.put(`/notifications/${id}`, data);
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);
export const completeNotification = (id, data) => api.patch(`/notifications/${id}/completar`, data);
export const reopenNotification = (id) => api.patch(`/notifications/${id}/reabrir`);
export const markVistasAdmin = () => api.patch('/notifications/marcar-vistas-admin');