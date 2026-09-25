export const LIMITE_PRODUCTOS = 1000;

export const paramsProductos = ({ search, categoria } = {}) => {
  const params = {};
  const term = String(search ?? '').trim();
  if (term) params.search = term;
  if (categoria) params.categoria = categoria;
  return Object.keys(params).length > 0 ? params : undefined;
};

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

export const soloEnDeposito = (p) => salonTotal(p) === 0 && depositoTotal(p) > 0;

export const variantesParaEnviar = (variants = []) =>
  variants
    .filter((v) => (v.talle || '').trim() || (Number(v.deposito) || 0) > 0)
    .map((v) => ({
      talle: (v.talle || '').trim(),
      color: v.color,
      deposito: Number(v.deposito) || 0,
    }));

export const tieneStockBajo = (p) => {
  if (p.stockMinimo == null) return false;
  if (p.variantes?.length > 0) return p.variantes.some((v) => (Number(v.cantidad) || 0) <= p.stockMinimo);
  return (Number(p.cantidad) || 0) <= p.stockMinimo;
};
