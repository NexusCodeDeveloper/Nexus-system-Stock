import CierreCaja from '../modules/Venta/CierreCajaModel.js';
import { buscarCajaAbierta } from './CajaUtils.js';

export const filtroCierreDia = (fecha) => ({
  fecha,
  $or: [{ turno: 'dia' }, { turno: { $exists: false } }, { turno: null }],
});

export const encontrarCierreDeFecha = async (fecha, session = null) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const query = CierreCaja.findOne({
    fecha: { $lte: d, $gt: new Date(d.getTime() - 86400000) },
    estado: { $ne: 'abierto' },
  })
    .select('_id fecha turno estado')
    .lean();
  if (session) query.session(session);
  return query;
};

export const mensajeCierre = (cierre) => {
  if (!cierre) return '';
  const fecha = new Date(cierre.fecha).toLocaleDateString('es-AR');
  const turno = cierre.turno === 'tarde' ? 'tarde' : cierre.turno === 'manana' ? 'mañana' : 'día';
  return ` Pertenece al cierre de ${turno} del ${fecha}: eliminá ese cierre primero si necesitás modificarlo.`;
};

export const MENSAJE_CIERRE_EN_CURSO = 'Hay un cierre de caja en curso. Esperá unos segundos y volvé a intentar.';

export const verificarOperacionNoEnCierre = async (fechaOperacion, session = null) => {
  const cierre = await encontrarCierreDeFecha(fechaOperacion, session);
  if (cierre) return { bloqueado: true, motivo: 'cerrado', cierre };

  const abierta = await buscarCajaAbierta(session);
  if (abierta) {
    const desde = new Date(abierta.abiertaEn || abierta.fecha);
    if (new Date(fechaOperacion) >= desde) {
      const tocada = await CierreCaja.findOneAndUpdate(
        { _id: abierta._id, estado: 'abierto' },
        { $set: { actualizadoEn: new Date() } },
        { session, new: true }
      );
      if (!tocada) return { bloqueado: true, motivo: 'cerrando', cierre: abierta };
    }
    return { bloqueado: false };
  }

  const cerrando = await CierreCaja.findOne({ estado: 'cerrando' })
    .select('_id fecha turno estado')
    .lean()
    .session(session);
  if (cerrando) return { bloqueado: true, motivo: 'cerrando', cierre: cerrando };
  return { bloqueado: false };
};
