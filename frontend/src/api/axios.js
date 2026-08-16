import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const salesToken = localStorage.getItem('salesToken');
  if (salesToken) {
    config.headers['x-sales-token'] = salesToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';

      if (url === '/auth/login' || url === '/sales-auth/login') {
        return Promise.reject(error);
      }

      if (url.startsWith('/sales/') && !url.startsWith('/sales-auth/')) {
        localStorage.removeItem('salesToken');
      } else if (!url.startsWith('/sales-auth/')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
