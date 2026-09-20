import { ZodError } from 'zod';
import logger, { lugarDesdePila } from '../utils/LoggerUtils.js';
import { describirError } from '../utils/MensajesErrorUtils.js';

const isDev = process.env.NODE_ENV !== 'production';

const estaVacio = (obj) => !obj || Object.keys(obj).length === 0;

const esErrorDeBase = (err) => [
  'MongoNetworkError',
  'MongoServerSelectionError',
  'MongoTimeoutError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
].includes(err.name) || err.name === 'MongooseError' && /buffering timed out/i.test(err.message || '');

const esWriteConflict = (err) => err?.code === 112 || err?.codeName === 'WriteConflict';

export const manejadorErrores = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const esZod = err instanceof ZodError;
  const status = err.statusCode
    || (esZod || err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : esWriteConflict(err) ? 409 : esErrorDeBase(err) ? 503 : 500);

  const descripcion = describirError(err);
  const datos = isDev && !estaVacio(req.body) && !estaVacio(req.query) && !estaVacio(req.params)
    ? { body: req.body, query: req.query, params: req.params }
    : undefined;

  const meta = {
    motivo: descripcion.motivo,
    detalle: descripcion.detalle,
    peticion: `${req.method} ${req.originalUrl}`,
    codigo: status,
    donde: lugarDesdePila(err.stack),
    seguimiento: req.id,
    quien: req.usuario ? `${req.usuario.email} (${req.usuario.rol})` : undefined,
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
    return res.status(400).json({ message: isDev ? descripcion.titulo : 'Datos inválidos' });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'El valor ya existe en la base de datos' });
  }

  if (esWriteConflict(err)) {
    return res.status(409).json({ message: 'La operación se cruzó con otra en simultáneo. Reintentá en unos segundos.' });
  }

  if (status === 503) {
    return res.status(503).json({ message: 'Servicio no disponible. Intente de nuevo en unos minutos.' });
  }

  res.status(status).json({
    message: status === 500 && !isDev ? 'Error interno del servidor' : descripcion.titulo,
  });
};
