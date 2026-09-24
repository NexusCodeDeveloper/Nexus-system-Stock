import { waitUntil } from '@vercel/functions';
import logger from './LoggerUtils.js';

export const enSegundoPlano = (promesa, contexto = {}) => {
  const tarea = Promise.resolve(promesa).catch((error) => {
    logger.error(contexto.mensaje || 'No se pudo completar una tarea en segundo plano', {
      motivo: error?.message || 'Error desconocido',
      origen: 'backend',
      lugar: contexto.lugar,
      queRevisar: contexto.queRevisar,
      stack: error?.stack,
    });
  });

  if (process.env.VERCEL) {
    waitUntil(tarea);
  }
};
