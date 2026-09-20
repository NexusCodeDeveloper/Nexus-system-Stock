import CierreCaja from '../modules/Venta/CierreCajaModel.js';

export const encontrarCierreDeFecha = async (fecha) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return CierreCaja.findOne({
    fecha: { $lte: d, $gt: new Date(d.getTime() - 86400000) },
    estado: { $ne: 'abierto' },
  })
    .select('_id fecha turno')
    .lean();
};

export const mensajeCierre = (cierre) => {
  if (!cierre) return '';
  const fecha = new Date(cierre.fecha).toLocaleDateString('es-AR');
  const turno = cierre.turno === 'tarde' ? 'tarde' : cierre.turno === 'manana' ? 'mañana' : 'día';
  return ` Pertenece al cierre de ${turno} del ${fecha}: eliminá ese cierre primero si necesitás modificarlo.`;
};
