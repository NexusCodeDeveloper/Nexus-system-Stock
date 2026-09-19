const norm = (v) => String(v ?? '').trim().toLowerCase();

export const findVariantIdx = (product, talle, color) => {
  if (!product?.variants?.length) return -1;
  const t = norm(talle);
  const c = norm(color);
  return product.variants.findIndex((v) => norm(v.talle) === t && norm(v.color) === c);
};

export const findVariant = (product, talle, color) => {
  const idx = findVariantIdx(product, talle, color);
  return idx === -1 ? null : product.variants[idx];
};

export const depositoDe = (product, talle, color) => {
  const variant = findVariant(product, talle, color);
  if (variant) return variant.deposito || 0;
  if (product?.variants?.length > 0) return 0;
  return product?.deposito || 0;
};

export const extraDeposito = (product, talle, color) => {
  const disponible = depositoDe(product, talle, color);
  return disponible > 0 ? ` Hay ${disponible} en depósito: reponé primero.` : '';
};
