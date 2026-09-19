export const obtenerArticulos = (venta) => {
  if (!venta) return [];
  if (venta.articulos && venta.articulos.length > 0) return venta.articulos;
  if (venta.producto || venta.precio != null || venta.cantidad != null) {
    return [{
      producto: venta.producto,
      cantidad: venta.cantidad,
      precio: venta.precio,
      talle: venta.talle || '',
      color: '',
      subtotal: venta.total,
    }];
  }
  return [];
};

export const unidadesNetasVenta = (venta) => {
  if (!venta || venta.estado === 'devuelta') return 0;
  const articulos = obtenerArticulos(venta);
  const total = articulos.reduce((acc, i) => acc + (Number(i.cantidad) || 0), 0);
  if (venta.articulos && venta.articulos.length > 0) return total;
  return Math.max(0, total - (venta.cantidadDevuelta || 0));
};

export const totalNetoVenta = (venta) => {
  if (!venta || venta.estado === 'devuelta') return 0;
  return Number(venta.total) || 0;
};

export const mismaLinea = (item, { producto, talle, color }) =>
  String(item?.producto?._id ?? item?.producto ?? '') === String(producto?._id ?? producto ?? '') &&
  String(item?.talle ?? '').trim().toLowerCase() === String(talle ?? '').trim().toLowerCase() &&
  String(item?.color ?? '').trim().toLowerCase() === String(color ?? '').trim().toLowerCase();

export const prorratearPagos = (pagos = [], monto = 0) => {
  const total = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const montoRound = Math.round((Number(monto) || 0) * 100) / 100;
  if (total <= 0 || montoRound <= 0) return [];
  const partes = [];
  let asignado = 0;
  pagos.forEach((p, i) => {
    const parte = i === pagos.length - 1
      ? Math.round((montoRound - asignado) * 100) / 100
      : Math.round(((Number(p.monto) || 0) / total) * montoRound * 100) / 100;
    asignado = Math.round((asignado + parte) * 100) / 100;
    if (parte > 0) partes.push({ metodo: p.metodo, monto: parte });
  });
  return partes;
};

export const totalEfectivoDePagos = (pagos = []) =>
  Math.round(
    pagos.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + (Number(p.monto) || 0), 0) * 100
  ) / 100;

export const esMismoDia = (fecha, offset = 0, referencia = new Date()) => {
  if (!fecha) return false;
  const a = new Date(new Date(fecha).getTime() - Number(offset) * 60000);
  const b = new Date(referencia.getTime() - Number(offset) * 60000);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
};
