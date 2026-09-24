export const responderErrorDeServicio = (error, res, next) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      message: error.message,
      ...(error.codigo ? { code: error.codigo } : {}),
    });
  }
  next(error);
  return undefined;
};
