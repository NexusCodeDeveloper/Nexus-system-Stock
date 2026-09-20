const norm = (v) => String(v ?? '').trim().toLowerCase();

export const indiceDeVariante = (product, talle, color) => {
  if (!product?.variantes?.length) return -1;
  const t = norm(talle);
  const c = norm(color);
  return product.variantes.findIndex((v) => norm(v.talle) === t && norm(v.color) === c);
};

export const encontrarVariante = (product, talle, color) => {
  const idx = indiceDeVariante(product, talle, color);
  return idx === -1 ? null : product.variantes[idx];
};

export const depositoDe = (product, talle, color) => {
  const variant = encontrarVariante(product, talle, color);
  if (variant) return variant.deposito || 0;
  if (product?.variantes?.length > 0) return 0;
  return product?.deposito || 0;
};

export const extraDeposito = (product, talle, color) => {
  const disponible = depositoDe(product, talle, color);
  return disponible > 0 ? ` Hay ${disponible} en depósito: reponé primero.` : '';
};
