import { ZodError } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

export const errorHandler = (err, req, res, next) => {
  if (isDev) {
    console.error(err.stack);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Error de validación',
      errors: err.errors.map((e) => ({
        campo: e.path.join('.'),
        mensaje: e.message,
      })),
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: isDev ? err.message : 'Datos inválidos' });
  }

  if (err.code === 11000) {
    return res.status(400).json({ message: 'El valor ya existe en la base de datos' });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    message: isDev ? err.message : 'Error interno del servidor',
  });
};
