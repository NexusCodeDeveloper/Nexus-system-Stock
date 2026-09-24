import CierreCaja from '../modules/Venta/CierreCajaModel.js';
import { inicioDeDia } from './FechasUtils.js';

export const MENSAJE_SIN_CAJA = 'Antes de operar tenés que abrir la caja';

export const buscarCajaAbierta = async (session = null) => {
  const query = CierreCaja.findOne({ estado: 'abierto' });
  if (session) query.session(session);
  return query;
};

export const respuestaSinCaja = (res, extra = {}) =>
  res.status(409).json({ message: MENSAJE_SIN_CAJA, code: 'SIN_CAJA', ...extra });

export const cajaEsDeHoy = (caja, offsetPedido = null) => {
  if (!caja) return false;
  const offset = caja.offset != null
    ? Number(caja.offset) || 0
    : Number.isFinite(Number(offsetPedido))
      ? Number(offsetPedido)
      : 0;
  const fechaCaja = new Date(caja.fecha);
  if (Number.isNaN(fechaCaja.getTime())) return false;
  const inicioCaja = new Date(
    Date.UTC(fechaCaja.getUTCFullYear(), fechaCaja.getUTCMonth(), fechaCaja.getUTCDate()) + offset * 60000
  );
  return inicioCaja.getTime() === inicioDeDia(offset).getTime();
};

export const mensajeCajaAnterior = (caja) => {
  const fecha = new Date(caja.fecha).toLocaleDateString('es-AR');
  return `La caja abierta es del ${fecha}. Para operar tenés que cerrarla primero.`;
};
