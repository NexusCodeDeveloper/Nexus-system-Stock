import axios from 'axios';
import { getItem, removeItem } from '../utils/storage';
import { reportarError } from '../utils/ReporteroErrores';
import { API_BASE_URL } from '../utils/apiBase';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;

    if (!error.response || status >= 500) {
      const metodo = (error.config?.method || 'get').toUpperCase();
      reportarError(error, {
        lugar: `axios ${metodo} ${url}`,
        status: status || error.code || 'sin respuesta',
      });
    }

    if (status === 401) {
      if (url === '/auth/login') {
        return Promise.reject(error);
      }

      removeItem('token');
      window.dispatchEvent(new Event('auth-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
