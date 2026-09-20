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

export const cajaEsDeHoy = (caja, offset = 0) => {
  if (!caja) return false;
  const hoy = inicioDeDia(offset);
  return new Date(caja.fecha).getTime() === hoy.getTime();
};

export const mensajeCajaAnterior = (caja) => {
  const fecha = new Date(caja.fecha).toLocaleDateString('es-AR');
  return `La caja abierta es del ${fecha}. Para operar tenés que cerrarla primero.`;
};
