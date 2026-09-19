import crypto from 'node:crypto';
import Venta from './VentaModel.js';

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
    const existe = await Venta.exists({ ticketNumero: codigo });
    if (!existe) return codigo;
  }
  throw new Error('No se pudo generar un número de ticket único');
};

export const guardarConTicketUnico = async (venta, session) => {
  venta.ticketNumero = await generarTicketNumero();
  return await venta.save({ session });
};

export const registrarDevolucionEnVenta = (venta, { motivo, cantidad, monto }) => {
  const montoRound = Math.round(monto * 100) / 100;
  venta.cantidadDevuelta = Math.round(((venta.cantidadDevuelta || 0) + cantidad) * 100) / 100;
  venta.montoDevuelto = Math.round(((venta.montoDevuelto || 0) + montoRound) * 100) / 100;
  venta.devoluciones = venta.devoluciones || [];
  venta.devoluciones.push({ motivo, cantidad, monto: montoRound, fecha: new Date() });
  restarDePagos(venta, montoRound);
};

export const anularDevolucionEnVenta = (venta, { cantidad, monto }) => {
  const montoRound = Math.round(monto * 100) / 100;
  venta.cantidadDevuelta = Math.max(0, Math.round(((venta.cantidadDevuelta || 0) - cantidad) * 100) / 100);
  venta.montoDevuelto = Math.max(0, Math.round(((venta.montoDevuelto || 0) - montoRound) * 100) / 100);
  if (venta.devoluciones?.length > 0) {
    const idx = venta.devoluciones
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => Math.round((d.monto || 0) * 100) / 100 === montoRound && (d.cantidad || 0) === cantidad)
      .pop()?.i;
    if (idx !== undefined) {
      venta.devoluciones.splice(idx, 1);
    } else {
      venta.devoluciones.pop();
    }
  }
  sumarAPagos(venta, montoRound);
};

const restarDePagos = (venta, montoRound) => {
  if (!venta.pagos || venta.pagos.length === 0) return;
  const totalPagado = venta.pagos.reduce((s, p) => s + p.monto, 0);
  if (totalPagado <= 0) return;
  let restante = montoRound;
  for (const p of venta.pagos) {
    if (restante <= 0) break;
    const parte = Math.min(p.monto, Math.round((p.monto / totalPagado) * montoRound * 100) / 100);
    p.monto = Math.max(0, Math.round((p.monto - parte) * 100) / 100);
    restante = Math.round((restante - parte) * 100) / 100;
  }
  for (const p of venta.pagos) {
    if (restante <= 0) break;
    const quitar = Math.min(p.monto, restante);
    p.monto = Math.max(0, Math.round((p.monto - quitar) * 100) / 100);
    restante = Math.round((restante - quitar) * 100) / 100;
  }
};

const sumarAPagos = (venta, montoRound) => {
  if (!venta.pagos || venta.pagos.length === 0) return;
  const totalPagado = venta.pagos.reduce((s, p) => s + p.monto, 0);
  let restante = montoRound;
  for (const p of venta.pagos) {
    if (restante <= 0) break;
    const parte = totalPagado > 0 ? Math.round((p.monto / totalPagado) * montoRound * 100) / 100 : 0;
    p.monto = Math.round((p.monto + parte) * 100) / 100;
    restante = Math.round((restante - parte) * 100) / 100;
  }
  if (restante > 0 && venta.pagos.length > 0) {
    venta.pagos[0].monto = Math.round((venta.pagos[0].monto + restante) * 100) / 100;
  }
};