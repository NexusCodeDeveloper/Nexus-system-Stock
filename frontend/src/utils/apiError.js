export const getApiErrorMessage = (err, fallback = 'Ocurrió un error') => {
  const data = err?.response?.data;
  if (data?.message && data.message !== 'Error de validación') return data.message;
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors[0].mensaje || data.message || fallback;
  }
  return data?.message || fallback;
};