export const LIMITES = {
  nombre: { min: 1, max: 80 },
  nombreProducto: { min: 1, max: 100 },
  proveedor: { min: 0, max: 80 },
  categoria: { min: 1, max: 60 },
  documento: { min: 0, max: 30 },
  telefono: { min: 0, max: 40 },
  email: { min: 0, max: 254 },
  direccion: { min: 0, max: 160 },
  referencia: { min: 0, max: 60 },
  nota: { min: 0, max: 300 },
  motivo: { min: 1, max: 200 },
  tituloAviso: { min: 1, max: 100 },
  descripcionAviso: { min: 1, max: 500 },
  comentarioAviso: { min: 0, max: 300 },
  talle: { min: 0, max: 20 },
  color: { min: 0, max: 30 },
  clave: { min: 6, max: 72 },
  claveLogin: { min: 1, max: 72 },
  nombreCaja: { min: 2, max: 80 },
  nombrePromocion: { min: 0, max: 60 },
  busqueda: { min: 0, max: 100 },
};

export const CANTIDAD = { min: 1, max: 999999 };
export const MONTO = { min: 0.01, max: 9999999.99 };
export const PRECIO = { min: 0.01, max: 99999999.99 };
export const PORCENTAJE = { min: 0, max: 100 };
export const FINANCIACION = { min: 0, max: 1000 };
export const DIAS_AVISO = { min: 0, max: 60 };
export const STOCK_MINIMO = { min: 0, max: 999999 };
export const ETIQUETA_MM = { min: 10, max: 300 };
export const ETIQUETA_CANTIDAD = { min: 1, max: 100 };
export const AUMENTO_PORCENTAJE = { min: 0.01, max: 10000 };
export const AUMENTO_MONTO = { min: 0.01, max: 99999999.99 };

const texto = (valor) => String(valor ?? '').trim();

export const limitarTexto = (valor, max) => String(valor ?? '').slice(0, max);

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const validarTexto = (valor, { min = 0, max } = {}, etiqueta = 'El campo') => {
  const v = texto(valor);
  if (!v) return min > 0 ? `${etiqueta} es obligatorio` : '';
  if (min > 1 && v.length < min) return `${etiqueta} debe tener al menos ${min} caracteres`;
  if (max && v.length > max) return `${etiqueta} no puede superar los ${max} caracteres`;
  return '';
};

export const validarEmail = (valor, { requerido = false } = {}) => {
  const v = texto(valor);
  if (!v) return requerido ? 'El email es obligatorio' : '';
  if (v.length > LIMITES.email.max) return `El email no puede superar los ${LIMITES.email.max} caracteres`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Email inválido';
  return '';
};

export const validarTelefono = (valor) => {
  const v = texto(valor);
  if (!v) return '';
  if (v.length > LIMITES.telefono.max) return `El teléfono no puede superar los ${LIMITES.telefono.max} caracteres`;
  if (!/^[0-9+()\s-]+$/.test(v)) return 'El teléfono solo puede contener números, espacios y los signos + ( ) -';
  return '';
};

export const validarNumero = (
  valor,
  { min, max, entero = false, etiqueta = 'El valor', requerido = true } = {}
) => {
  if (valor === '' || valor === null || valor === undefined) {
    return requerido ? `${etiqueta} es obligatorio` : '';
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) return `${etiqueta} debe ser un número válido`;
  if (entero && !Number.isInteger(n)) return `${etiqueta} debe ser un número entero`;
  if (min !== undefined && n < min) return `${etiqueta} debe ser mayor o igual a ${min}`;
  if (max !== undefined && n > max) return `${etiqueta} no puede superar ${max}`;
  return '';
};

export const validarMonto = (valor, { min = MONTO.min, max = MONTO.max, etiqueta = 'El monto' } = {}) =>
  validarNumero(valor, { min, max, etiqueta });

export const validarEntero = (
  valor,
  { min = CANTIDAD.min, max = CANTIDAD.max, etiqueta = 'La cantidad', requerido = true } = {}
) => validarNumero(valor, { min, max, entero: true, etiqueta, requerido });

export const validarFecha = (valor, { requerido = true, min, max, etiqueta = 'La fecha' } = {}) => {
  if (!valor) return requerido ? `${etiqueta} es obligatoria` : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${etiqueta} es inválida`;
  if (min && valor < min) return `${etiqueta} no puede ser anterior a ${min}`;
  if (max && valor > max) return `${etiqueta} no puede ser posterior a ${max}`;
  return '';
};

export const validarRangoFechas = (desde, hasta, etiqueta = 'La fecha "desde"') => {
  if (desde && hasta && desde > hasta) return `${etiqueta} no puede ser posterior a "hasta"`;
  return '';
};

export const hayErrores = (errores) => Object.values(errores).some(Boolean);

export const limpiar = (valor) => texto(valor);
