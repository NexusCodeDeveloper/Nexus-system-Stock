import logger from '../../utils/logger.js';
import { errorReportSchema } from './ErrorReportSchema.js';

export const reportError = (req, res, next) => {
  try {
    const data = errorReportSchema.parse(req.body);

    logger.error('Error en el navegador', {
      motivo: data.mensaje,
      donde: data.lugar || data.componente || data.ruta || 'frontend',
      ruta: data.ruta,
      componente: data.componente,
      seguimiento: req.id,
      quien: data.contexto?.usuario || undefined,
      navegador: data.userAgent || req.headers['user-agent'] || undefined,
      ip: req.ip,
      queRevisar: 'Revisá el stack y la pantalla indicada, y probá reproducir el error.',
      origen: 'frontend',
      stack: data.stack,
    });

    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
};
