export const LIMITE_PRODUCTOS = 1000;

export const depositoTotal = (p) =>
  p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (Number(v.deposito) || 0), 0) : (Number(p.deposito) || 0);

export const salonTotal = (p) =>
  p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (Number(v.cantidad) || 0), 0) : (Number(p.cantidad) || 0);

export const variantLabel = (v) => [v.talle, v.color].filter(Boolean).join(' / ') || 'Base';

export const variantShortLabel = (v) => {
  const parts = [];
  if (v.talle) parts.push(v.talle);
  if (v.color) parts.push(v.color);
  return parts.join(' / ') || '—';
};

export const tieneStockBajo = (p) => {
  if (p.stockMinimo == null) return false;
  if (p.variantes?.length > 0) return p.variantes.some((v) => (Number(v.cantidad) || 0) <= p.stockMinimo);
  return (Number(p.cantidad) || 0) <= p.stockMinimo;
};
