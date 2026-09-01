import { randomInt } from 'node:crypto';

export const generarTicketNumero = () => String(randomInt(100000000, 1000000000));

export const guardarConTicketUnico = async (sale, session) => {
  const MAX_INTENTOS = 10;
  for (let i = 0; i < MAX_INTENTOS; i++) {
    sale.ticketNumero = generarTicketNumero();
    try {
      return await sale.save({ session });
    } catch (error) {
      if (error.code !== 11000 || i === MAX_INTENTOS - 1) throw error;
    }
  }
};

export const registrarDevolucionEnVenta = (sale, { motivo, cantidad, monto }) => {
  const montoRound = Math.round(monto * 100) / 100;
  sale.cantidadDevuelta = Math.round(((sale.cantidadDevuelta || 0) + cantidad) * 100) / 100;
  sale.montoDevuelto = Math.round(((sale.montoDevuelto || 0) + montoRound) * 100) / 100;
  sale.devoluciones = sale.devoluciones || [];
  sale.devoluciones.push({ motivo, cantidad, monto: montoRound, fecha: new Date() });
  restarDePagos(sale, montoRound);
};

export const anularDevolucionEnVenta = (sale, { cantidad, monto }) => {
  const montoRound = Math.round(monto * 100) / 100;
  sale.cantidadDevuelta = Math.max(0, Math.round(((sale.cantidadDevuelta || 0) - cantidad) * 100) / 100);
  sale.montoDevuelto = Math.max(0, Math.round(((sale.montoDevuelto || 0) - montoRound) * 100) / 100);
  if (sale.devoluciones?.length > 0) {
    const idx = sale.devoluciones
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => Math.round((d.monto || 0) * 100) / 100 === montoRound && (d.cantidad || 0) === cantidad)
      .pop()?.i;
    if (idx !== undefined) {
      sale.devoluciones.splice(idx, 1);
    } else {
      sale.devoluciones.pop();
    }
  }
  sumarAPagos(sale, montoRound);
};

const restarDePagos = (sale, montoRound) => {
  if (!sale.pagos || sale.pagos.length === 0) return;
  const totalPagado = sale.pagos.reduce((s, p) => s + p.monto, 0);
  if (totalPagado <= 0) return;
  let restante = montoRound;
  for (const p of sale.pagos) {
    if (restante <= 0) break;
    const parte = Math.min(p.monto, Math.round((p.monto / totalPagado) * montoRound * 100) / 100);
    p.monto = Math.max(0, Math.round((p.monto - parte) * 100) / 100);
    restante = Math.round((restante - parte) * 100) / 100;
  }
  for (const p of sale.pagos) {
    if (restante <= 0) break;
    const quitar = Math.min(p.monto, restante);
    p.monto = Math.max(0, Math.round((p.monto - quitar) * 100) / 100);
    restante = Math.round((restante - quitar) * 100) / 100;
  }
};

const sumarAPagos = (sale, montoRound) => {
  if (!sale.pagos || sale.pagos.length === 0) return;
  const totalPagado = sale.pagos.reduce((s, p) => s + p.monto, 0);
  let restante = montoRound;
  for (const p of sale.pagos) {
    if (restante <= 0) break;
    const parte = totalPagado > 0 ? Math.round((p.monto / totalPagado) * montoRound * 100) / 100 : 0;
    p.monto = Math.round((p.monto + parte) * 100) / 100;
    restante = Math.round((restante - parte) * 100) / 100;
  }
  if (restante > 0 && sale.pagos.length > 0) {
    sale.pagos[0].monto = Math.round((sale.pagos[0].monto + restante) * 100) / 100;
  }
};