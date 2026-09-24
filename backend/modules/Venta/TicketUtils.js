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
  if (!venta.ticketNumero) {
    venta.ticketNumero = await generarTicketNumero();
  }
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
    }
  }
  sumarAPagos(venta, montoRound);
};

const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

const repartirProporcional = (montos, monto, conTope) => {
  const partes = montos.map(() => 0);
  const objetivo = redondear(monto);
  if (objetivo <= 0 || montos.length === 0) return partes;

  const total = montos.reduce((s, m) => s + m, 0);
  if (total <= 0) {
    partes[montos.length - 1] = objetivo;
    return partes;
  }

  let asignado = 0;
  for (let i = 0; i < montos.length; i += 1) {
    const esUltimo = i === montos.length - 1;
    let parte = esUltimo
      ? redondear(objetivo - asignado)
      : redondear((montos[i] / total) * objetivo);
    if (conTope) parte = Math.min(parte, montos[i]);
    partes[i] = Math.max(0, parte);
    asignado = redondear(asignado + partes[i]);
  }

  let resto = redondear(objetivo - asignado);
  if (resto === 0) return partes;

  if (!conTope) {
    const i = montos.length - 1;
    partes[i] = Math.max(0, redondear(partes[i] + resto));
    return partes;
  }

  for (let i = 0; i < montos.length && resto > 0; i += 1) {
    const espacio = redondear(montos[i] - partes[i]);
    if (espacio <= 0) continue;
    const agregar = Math.min(espacio, resto);
    partes[i] = redondear(partes[i] + agregar);
    resto = redondear(resto - agregar);
  }
  return partes;
};

const restarDePagos = (venta, montoRound) => {
  if (!venta.pagos || venta.pagos.length === 0) return;
  const montos = venta.pagos.map((p) => redondear(p.monto));
  const partes = repartirProporcional(montos, montoRound, true);
  venta.pagos.forEach((p, i) => {
    p.monto = Math.max(0, redondear(montos[i] - partes[i]));
  });
};

const sumarAPagos = (venta, montoRound) => {
  if (!venta.pagos || venta.pagos.length === 0) return;
  const montos = venta.pagos.map((p) => redondear(p.monto));
  const partes = repartirProporcional(montos, montoRound, false);
  venta.pagos.forEach((p, i) => {
    p.monto = redondear(montos[i] + partes[i]);
  });
};