import crypto from 'node:crypto';
import Sale from './SaleModel.js';

const TICKET_PREFIJO = 'T-';
const TICKET_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TICKET_LARGO = 8;
const TICKET_INTENTOS = 10;

const generarCodigoAleatorio = () => {
  let codigo = '';
  for (let i = 0; i < TICKET_LARGO; i += 1) {
    codigo += TICKET_ALFABETO[crypto.randomInt(0, TICKET_ALFABETO.length)];
  }
  return `${TICKET_PREFIJO}${codigo}`;
};

export const generarTicketNumero = async () => {
  for (let intento = 0; intento < TICKET_INTENTOS; intento += 1) {
    const codigo = generarCodigoAleatorio();
    const existe = await Sale.exists({ ticketNumero: codigo });
    if (!existe) return codigo;
  }
  throw new Error('No se pudo generar un número de ticket único');
};

export const guardarConTicketUnico = async (sale, session) => {
  sale.ticketNumero = await generarTicketNumero();
  return await sale.save({ session });
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