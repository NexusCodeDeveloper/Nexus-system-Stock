export const obtenerMensajeErrorApi = (err, fallback = 'Ocurrió un error') => {
  const data = err?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const detalle = data.errors[0]?.mensaje;
    if (detalle) return detalle;
  }
  if (data?.message && data.message !== 'Error de validación') return data.message;
  return data?.message || fallback;
};