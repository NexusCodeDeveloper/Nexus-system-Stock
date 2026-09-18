const contiene = (texto, ...claves) => {
  const t = String(texto || '').toLowerCase();
  return claves.some((clave) => t.includes(clave.toLowerCase()));
};

const limpiar = (valor, max = 300) => {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
};

const traducirIssue = (issue) => {
  const campo = issue?.path?.join('.') || 'campo';
  switch (issue?.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') return `El campo "${campo}" es obligatorio`;
      return `El campo "${campo}" debe ser de tipo ${issue.expected}`;
    case 'too_small':
      if (issue.type === 'string') return `El campo "${campo}" es demasiado corto (mínimo ${issue.minimum} caracteres)`;
      if (issue.type === 'array') return `Debés incluir al menos ${issue.minimum} elemento(s) en "${campo}"`;
      return `El campo "${campo}" debe ser mayor o igual a ${issue.minimum}`;
    case 'too_big':
      if (issue.type === 'string') return `El campo "${campo}" es demasiado largo (máximo ${issue.maximum} caracteres)`;
      if (issue.type === 'array') return `"${campo}" admite como máximo ${issue.maximum} elemento(s)`;
      return `El campo "${campo}" debe ser menor o igual a ${issue.maximum}`;
    case 'invalid_enum_value':
      return `El campo "${campo}" tiene un valor no permitido ("${issue.received}")`;
    case 'invalid_string':
      return `El campo "${campo}" tiene un formato inválido`;
    case 'not_finite':
      return `El campo "${campo}" debe ser un número válido`;
    case 'unrecognized_keys':
      return `Se enviaron campos no permitidos: ${(issue.keys || []).join(', ')}`;
    default: {
      const mensaje = limpiar(issue?.message, 120);
      if (!mensaje || mensaje === 'Required') return `El campo "${campo}" es inválido`;
      return `El campo "${campo}": ${mensaje}`;
    }
  }
};

const esZod = (err) => Array.isArray(err?.issues);

export const describirError = (err) => {
  const nombre = err?.name || 'Error';
  const mensajeOriginal = limpiar(err?.message, 400);

  if (esZod(err)) {
    return {
      titulo: 'Datos inválidos en la solicitud',
      motivo: err.issues.map(traducirIssue).join(' · '),
      queRevisar: 'Corregí los campos indicados y volvé a intentar.',
      errores: err.issues.map((issue) => ({
        campo: issue?.path?.join('.') || 'campo',
        mensaje: traducirIssue(issue),
      })),
    };
  }

  if (nombre === 'CastError') {
    return {
      titulo: `El ID "${limpiar(err.value, 60)}" no es un identificador válido`,
      motivo: `No se pudo buscar por "${err.path || '_id'}"`,
      queRevisar: 'El ID debe ser un ObjectId de MongoDB (24 caracteres hexadecimales).',
    };
  }

  if (nombre === 'ValidationError' && err.errors) {
    const detalles = Object.entries(err.errors).map(([campo, e]) => `${campo}: ${limpiar(e?.message, 120)}`);
    return {
      titulo: 'Datos inválidos',
      motivo: detalles.join(' · '),
      queRevisar: 'Revisá los campos indicados y volvé a intentar.',
    };
  }

  if (err?.code === 11000) {
    const duplicados = err.keyValue ? Object.entries(err.keyValue).map(([k, v]) => `${k}="${limpiar(v, 60)}"`).join(', ') : '';
    return {
      titulo: 'El valor ya existe en la base de datos',
      motivo: duplicados ? `Valor duplicado: ${duplicados}` : mensajeOriginal,
      queRevisar: 'Usá otro valor único (nombre, email, etc.).',
    };
  }

  if (nombre === 'TokenExpiredError') {
    return {
      titulo: 'La sesión expiró',
      queRevisar: 'Volvé a iniciar sesión.',
    };
  }

  if (nombre === 'JsonWebTokenError') {
    return {
      titulo: 'Token de sesión inválido',
      queRevisar: 'Volvé a iniciar sesión.',
    };
  }

  const status = err?.statusCode;

  if (status === 401) {
    return { titulo: 'No autorizado', motivo: mensajeOriginal, queRevisar: 'Iniciá sesión de nuevo.' };
  }
  if (status === 403) {
    return { titulo: 'Acceso denegado', motivo: mensajeOriginal, queRevisar: 'Se requiere rol de administrador.' };
  }
  if (status === 404) {
    return { titulo: 'No se encontró el recurso solicitado', motivo: mensajeOriginal };
  }
  if (status === 409) {
    return { titulo: 'Conflicto con datos existentes', motivo: mensajeOriginal, queRevisar: 'Revisá si el registro ya existe.' };
  }
  if (status === 502) {
    return {
      titulo: 'No se pudo conectar con el servidor de mail',
      motivo: mensajeOriginal,
      queRevisar: 'Revisá la configuración MAIL_* o BREVO_API_KEY.',
    };
  }

  if (err?.code === 112 || err?.codeName === 'WriteConflict') {
    return {
      titulo: 'Operación en conflicto con otra simultánea',
      motivo: 'Dos operaciones intentaron modificar el mismo documento a la vez.',
      queRevisar: 'Reintentá la operación; si se repite seguido, revisá el flujo de ventas concurrentes.',
    };
  }

  if (contiene(mensajeOriginal, 'transaction numbers are only allowed')) {
    return {
      titulo: 'La base de datos no soporta transacciones',
      motivo: 'La operación requiere un replica set de MongoDB.',
      detalle: mensajeOriginal,
      queRevisar: 'Usá un clúster de MongoDB Atlas (replica set) o revisá MONGO_URI.',
    };
  }

  if (contiene(mensajeOriginal, 'authentication failed', 'bad auth', 'not authorized')) {
    return {
      titulo: 'La base de datos rechazó las credenciales',
      detalle: mensajeOriginal,
      queRevisar: 'Revisá el usuario y la contraseña en MONGO_URI.',
    };
  }

  if (contiene(mensajeOriginal, 'econnrefused', 'enotfound', 'etimedout', 'server selection', 'could not connect', 'ip whitelist', 'not whitelisted')) {
    return {
      titulo: 'No se pudo conectar con la base de datos',
      detalle: mensajeOriginal,
      queRevisar: 'Verificá MONGO_URI y que la IP esté permitida en Atlas.',
    };
  }

  if (status && status >= 400 && status < 500) {
    return {
      titulo: mensajeOriginal || 'Solicitud inválida',
      queRevisar: 'Revisá los datos enviados.',
    };
  }

  return {
    titulo: mensajeOriginal || 'Ocurrió un error inesperado',
    queRevisar: 'Revisá el detalle y la pila; si persiste, reportalo.',
  };
};
