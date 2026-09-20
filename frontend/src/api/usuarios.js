import api from './axios';

export const obtenerUsuarios = () => api.get('/usuarios');
export const crearUsuario = (data) => api.post('/usuarios', data);
export const actualizarUsuario = (id, data) => api.put(`/usuarios/${id}`, data);
export const reiniciarClave = (id, clave) => api.patch(`/usuarios/${id}/clave`, { clave });
export const cambiarActivo = (id, activo) => api.patch(`/usuarios/${id}/activo`, { activo });
export const eliminarUsuario = (id) => api.delete(`/usuarios/${id}`);
