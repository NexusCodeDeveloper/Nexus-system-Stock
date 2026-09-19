import { randomUUID } from 'node:crypto';
import logger from '../utils/LoggerUtils.js';

export const contextoPeticion = (req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

export const registradorPeticiones = (req, res, next) => {
  const inicio = Date.now();

  res.on('finish', () => {
    const meta = {
      compacto: true,
      duracion: Date.now() - inicio,
      quien: req.usuario?.email || undefined,
      ip: req.ip,
      seguimiento: req.id,
    };
    const resumen = `${req.method} ${req.originalUrl} → ${res.statusCode}`;

    if (res.statusCode >= 500) {
      logger.error(resumen, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(`${resumen} · revisá los datos enviados`, meta);
    } else {
      logger.debug(resumen, meta);
    }
  });

  next();
};
