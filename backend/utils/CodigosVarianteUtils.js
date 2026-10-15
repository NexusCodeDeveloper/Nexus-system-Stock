export const CODIGO_VARIANTE_REGEX = /^NC-\d{6}-\d{2}$/;
export const SUFIJO_VARIANTE_MAX = 99;

const normalizar = (valor) => String(valor ?? '').trim().toUpperCase();

export const esCodigoDeVarianteDe = (codigo, codigoProducto) => {
  const cod = normalizar(codigo);
  const base = normalizar(codigoProducto);
  if (!cod || !base || !CODIGO_VARIANTE_REGEX.test(cod)) return false;
  return cod.startsWith(`${base}-`);
};

export const sufijoDeCodigo = (codigo) => {
  const cod = normalizar(codigo);
  if (!CODIGO_VARIANTE_REGEX.test(cod)) return 0;
  return Number(cod.slice(-2));
};

const formatearCodigoVariante = (codigoProducto, sufijo) =>
  `${normalizar(codigoProducto)}-${String(sufijo).padStart(2, '0')}`;

export const asegurarCodigosVariante = (producto) => {
  const codigoProducto = normalizar(producto?.codigo);
  if (!codigoProducto || !producto?.variantes?.length) return false;

  let contador = Math.max(Number(producto.siguienteSufijoVariante) || 1, 1);
  const vistos = new Set();
  let cambio = false;

  for (const variante of producto.variantes) {
    const codigo = normalizar(variante.codigo);
    if (esCodigoDeVarianteDe(codigo, codigoProducto) && !vistos.has(codigo)) {
      vistos.add(codigo);
      if (variante.codigo !== codigo) {
        variante.codigo = codigo;
        cambio = true;
      }
      contador = Math.max(contador, sufijoDeCodigo(codigo) + 1);
      continue;
    }
    if (contador > SUFIJO_VARIANTE_MAX) {
      throw new Error(
        `No se pueden generar más de ${SUFIJO_VARIANTE_MAX} códigos de variante para "${producto.nombre || codigoProducto}"`
      );
    }
    const nuevo = formatearCodigoVariante(codigoProducto, contador);
    variante.codigo = nuevo;
    vistos.add(nuevo);
    contador += 1;
    cambio = true;
  }

  if (Number(producto.siguienteSufijoVariante) !== contador) {
    producto.siguienteSufijoVariante = contador;
    cambio = true;
  }

  return cambio;
};

export const variantePorCodigo = (producto, codigo) => {
  const cod = normalizar(codigo);
  if (!cod || !producto?.variantes?.length) return null;
  return producto.variantes.find((v) => normalizar(v.codigo) === cod) || null;
};

export const faltanCodigosDeVariante = (producto) => {
  if (!producto?.variantes?.length) return false;
  const codigoProducto = normalizar(producto.codigo);
  if (!codigoProducto) return false;
  const vistos = new Set();
  for (const variante of producto.variantes) {
    const codigo = normalizar(variante.codigo);
    if (!esCodigoDeVarianteDe(codigo, codigoProducto) || vistos.has(codigo)) return true;
    vistos.add(codigo);
  }
  return false;
};
