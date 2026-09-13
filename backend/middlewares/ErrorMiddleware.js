import { ZodError } from 'zod';
import logger, { lugarDesdeStack } from '../utils/logger.js';
import { describirError } from '../utils/mensajesError.js';

const isDev = process.env.NODE_ENV !== 'production';

const estaVacio = (obj) => !obj || Object.keys(obj).length === 0;

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const esZod = err instanceof ZodError;
  const status = err.statusCode
    || (esZod || err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500);

  const descripcion = describirError(err);
  const datos = estaVacio(req.body) && estaVacio(req.query) && estaVacio(req.params)
    ? undefined
    : { body: req.body, query: req.query, params: req.params };

  const meta = {
    motivo: descripcion.motivo,
    detalle: descripcion.detalle,
    peticion: `${req.method} ${req.originalUrl}`,
    codigo: status,
    donde: lugarDesdeStack(err.stack),
    seguimiento: req.id,
    quien: req.user ? `${req.user.email} (${req.user.rol})` : undefined,
    ip: req.ip,
    navegador: req.headers?.['user-agent'] || undefined,
    queRevisar: descripcion.queRevisar,
    errores: descripcion.errores,
    datos,
    origen: 'backend',
    stack: status >= 500 ? err.stack : undefined,
  };

  if (status >= 500) {
    logger.error(descripcion.titulo, meta);
  } else {
    logger.warn(descripcion.titulo, meta);
  }

  if (esZod) {
    return res.status(400).json({
      message: descripcion.titulo,
      errors: descripcion.errores,
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: isDev ? descripcion.titulo : 'Datos inválidos' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: descripcion.titulo });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'El valor ya existe en la base de datos' });
  }

  res.status(status).json({
    message: status === 500 && !isDev ? 'Error interno del servidor' : descripcion.titulo,
  });
};
