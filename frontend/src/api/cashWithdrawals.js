import api from './axios';

export const createCashWithdrawal = (data) => api.post('/cash-withdrawals', data);
export const getCashWithdrawals = (params) => api.get('/cash-withdrawals', { params });
export const getCashWithdrawalsAvailable = (params) => api.get('/cash-withdrawals/available', { params });
export const deleteCashWithdrawal = (id) => api.delete(`/cash-withdrawals/${id}`, { params: { offset: new Date().getTimezoneOffset() } });