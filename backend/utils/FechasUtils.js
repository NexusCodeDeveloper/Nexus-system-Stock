export const parsearFecha = (str, offset = 0) => {
  if (!str) return null;
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return new Date(dt.getTime() + Number(offset) * 60000);
};

export const obtenerRango = (start, end, offset = 0) => {
  const off = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  const from = parsearFecha(start, off);
  const to = parsearFecha(end, off);
  if (start && !from) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }
  if (end && !to) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }
  return {
    $gte: from || new Date(0),
    $lt: to ? new Date(to.getTime() + 86400000) : new Date(8640000000000000),
  };
};

export const fechaHoyCliente = (offset = 0) => {
  const local = new Date(Date.now() - Number(offset) * 60000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
};

export const inicioDeDia = (offset = 0) => {
  const { y, m, d } = fechaHoyCliente(offset);
  return new Date(Date.UTC(y, m - 1, d) + Number(offset) * 60000);
};
