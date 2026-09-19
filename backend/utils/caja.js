import DailyClose from '../modules/Sale/DailyCloseModel.js';
import { startOfDayDate } from './fechas.js';

export const MENSAJE_SIN_CAJA = 'Antes de operar tenés que abrir la caja';

export const buscarCajaAbierta = async (session = null) => {
  const query = DailyClose.findOne({ estado: 'abierto' });
  if (session) query.session(session);
  return query;
};

export const respuestaSinCaja = (res, extra = {}) =>
  res.status(409).json({ message: MENSAJE_SIN_CAJA, code: 'SIN_CAJA', ...extra });

export const cajaEsDeHoy = (caja, offset = 0) => {
  if (!caja) return false;
  const hoy = startOfDayDate(offset);
  return new Date(caja.fecha).getTime() === hoy.getTime();
};

export const mensajeCajaAnterior = (caja) => {
  const fecha = new Date(caja.fecha).toLocaleDateString('es-AR');
  return `La caja abierta es del ${fecha}. Para operar tenés que cerrarla primero.`;
};
