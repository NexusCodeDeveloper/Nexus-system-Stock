export const aCentavos = (valor) => Math.round((Number(valor) || 0) * 100);

export const deCentavos = (valor) => (Number(valor) || 0) / 100;

export const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

export const campoCentavos = {
  type: Number,
  get: deCentavos,
  set: aCentavos,
};

export const campoCentavosPositivo = {
  ...campoCentavos,
  min: 0,
};
