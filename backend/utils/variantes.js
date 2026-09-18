export const findVariantIdx = (product, talle, color) => {
  if (!product?.variants?.length) return -1;
  return product.variants.findIndex((v) => v.talle === (talle || '') && v.color === (color || ''));
};

export const findVariant = (product, talle, color) => {
  const idx = findVariantIdx(product, talle, color);
  return idx === -1 ? null : product.variants[idx];
};

export const depositoDe = (product, talle, color) => {
  const variant = findVariant(product, talle, color);
  return variant ? (variant.deposito || 0) : (product?.deposito || 0);
};

export const extraDeposito = (product, talle, color) => {
  const disponible = depositoDe(product, talle, color);
  return disponible > 0 ? ` Hay ${disponible} en depósito: reponé primero.` : '';
};
