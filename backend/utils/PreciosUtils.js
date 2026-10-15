import { aCentavos, deCentavos } from './DineroUtils.js';

export const TIPOS_PROMOCION = ['porcentaje', 'monto'];

export const TIPOS_AUMENTO_PRECIO = ['porcentaje', 'monto'];

/** La promoción está vigente ahora mismo (y no fue cancelada). */
export const promocionVigente = (promo, ahora = new Date()) =>
  Boolean(promo) && promo.activa !== false && new Date(promo.desde) <= ahora && new Date(promo.hasta) >= ahora;

/** La promoción cubre el producto: aplica a todos o lo tiene en la lista. */
export const promocionCubreProducto = (promo, productoId) =>
  Boolean(promo) &&
  (promo.todos === true || (promo.productos || []).some((id) => String(id) === String(productoId)));

/** Precio con el descuento de la promoción, en centavos enteros. */
export const precioConPromocion = (precioCentavos, promo) => {
  const base = Math.max(0, Math.round(Number(precioCentavos) || 0));
  if (!promo) return base;
  if (promo.tipo === 'porcentaje') {
    const porcentaje = Math.min(Math.max(Number(promo.valor) || 0, 0), 100);
    return Math.max(0, Math.round(base * (1 - porcentaje / 100)));
  }
  const descuento = Math.max(0, aCentavos(promo.valor));
  return Math.max(0, base - descuento);
};

/** Primera promoción vigente que cubre el producto (no se permiten superpuestas). */
export const promoVigenteDeProducto = (promos = [], productoId, ahora = new Date()) =>
  (promos || []).find((promo) => promocionVigente(promo, ahora) && promocionCubreProducto(promo, productoId)) || null;

/** Bloque `oferta` que se agrega a la respuesta de un producto, o null si no tiene. */
export const ofertaDeProducto = (producto, promos = [], ahora = new Date()) => {
  const promo = promoVigenteDeProducto(promos, producto?._id, ahora);
  if (!promo) return null;
  const precioNormal = aCentavos(producto.precio);
  const precioOferta = precioConPromocion(precioNormal, promo);
  if (precioOferta >= precioNormal) return null;
  return {
    promocion: promo._id,
    nombre: promo.nombre || '',
    tipo: promo.tipo,
    valor: promo.valor,
    precioOferta: deCentavos(precioOferta),
    hasta: promo.hasta,
  };
};

/** Precio unitario vigente en pesos: con oferta si corresponde, si no el normal. */
export const precioVigentePesos = (producto, promos = [], ahora = new Date()) => {
  const promo = promoVigenteDeProducto(promos, producto?._id, ahora);
  return deCentavos(precioConPromocion(aCentavos(producto?.precio), promo));
};

/** Estado legible de una promoción según sus fechas y si fue cancelada. */
export const estadoDePromocion = (promo, ahora = new Date()) => {
  if (promo.activa === false) return 'cancelada';
  if (new Date(promo.desde) > ahora) return 'programada';
  if (new Date(promo.hasta) < ahora) return 'vencida';
  return 'activa';
};
