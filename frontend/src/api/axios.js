import axios from 'axios';
import { getItem, removeItem } from '../utils/storage';
import { reportarError } from '../utils/errorReporter';

const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

const api = axios.create({
  baseURL,
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

    if (!url.includes('/errors') && (!error.response || status >= 500)) {
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
