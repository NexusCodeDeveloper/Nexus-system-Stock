import logger from '../../utils/LoggerUtils.js';
import { schemaReporteError } from './ReporteErrorSchema.js';

const limpiar = (valor, max = 500) => String(valor || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);

export const reportarError = (req, res, next) => {
  try {
    const data = schemaReporteError.parse(req.body);

    logger.error('Error en el navegador', {
      motivo: limpiar(data.mensaje, 1000),
      donde: limpiar(data.lugar || data.componente || data.ruta || 'frontend'),
      ruta: limpiar(data.ruta, 300),
      componente: limpiar(data.componente, 300),
      seguimiento: req.id,
      quien: limpiar(data.contexto?.usuario, 120) || undefined,
      navegador: limpiar(data.userAgent || req.headers['user-agent'], 300) || undefined,
      ip: req.ip,
      queRevisar: 'Revisá el stack y la pantalla indicada, y probá reproducir el error.',
      origen: 'frontend',
      stack: String(data.stack || '').slice(0, 4000),
    });

    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
};
