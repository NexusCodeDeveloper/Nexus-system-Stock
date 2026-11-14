export const RUTAS = {
  PRODUCTOS: '/productos',
  DEPOSITO: '/deposito',
  MOVIMIENTOS_STOCK: '/deposito?tab=movimientos',
  VENTAS: '/ventas',
  CIERRES: '/ventas?tab=cierres',
  DEVOLUCIONES: '/devoluciones',
  NOTIFICACIONES: '/notificaciones',
  PAPELERA: '/papelera',
  CLIENTES: '/clientes',
};

export const formatearMonto = (valor) =>
  `$${Number(valor || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const etiquetaVariante = (talle, color) =>
  [talle, color]
    .map((parte) => String(parte ?? '').trim())
    .filter(Boolean)
    .join(' / ');

export const nombreConVariante = (nombre, talle, color) => {
  const variante = etiquetaVariante(talle, color);
  return variante ? `${nombre || 'Producto'} (${variante})` : (nombre || 'Producto');
};

export const unidades = (cantidad) => `${Number(cantidad) || 0} u.`;

const claveVariante = (talle, color) =>
  `${String(talle ?? '').trim().toLowerCase()}|${String(color ?? '').trim().toLowerCase()}`;

const stockMinimoDe = (producto) => {
  const valor = Number(producto?.stockMinimo);
  return Number.isFinite(valor) ? valor : 0;
};

const valorNumerico = (valor) => Number(valor) || 0;

export const snapshotProducto = (producto) => ({
  nombre: producto?.nombre || '',
  precio: valorNumerico(producto?.precio),
  cantidad: valorNumerico(producto?.cantidad),
  deposito: valorNumerico(producto?.deposito),
  stockMinimo: stockMinimoDe(producto),
  categoria: producto?.categoria || '',
  proveedor: producto?.proveedor || '',
  colores: [...(producto?.colores || [])],
  variantes: (producto?.variantes || []).map((variante) => ({
    talle: variante?.talle || '',
    color: variante?.color || '',
    cantidad: valorNumerico(variante?.cantidad),
    deposito: valorNumerico(variante?.deposito),
  })),
});

const stockDeProducto = (producto, talle = '', color = '') => {
  if (producto?.variantes?.length > 0) {
    const clave = claveVariante(talle, color);
    const variante = producto.variantes.find(
      (item) => claveVariante(item.talle, item.color) === clave
    );
    return {
      salon: valorNumerico(variante?.cantidad),
      deposito: valorNumerico(variante?.deposito),
    };
  }
  return {
    salon: valorNumerico(producto?.cantidad),
    deposito: valorNumerico(producto?.deposito),
  };
};

const estadoSalon = (producto, talle = '', color = '') => {
  const { salon } = stockDeProducto(producto, talle, color);
  const minimo = stockMinimoDe(producto);
  if (salon === 0) return 'sin stock';
  if (salon <= minimo) return `bajo mínimo (${minimo})`;
  return '';
};

const variantesEnStockBajo = (producto) => {
  const minimo = stockMinimoDe(producto);
  if (producto?.variantes?.length > 0) {
    return producto.variantes
      .map((variante) => ({
        nombre: producto.nombre || 'Producto',
        variante: etiquetaVariante(variante.talle, variante.color),
        cantidad: valorNumerico(variante.cantidad),
        deposito: valorNumerico(variante.deposito),
        minimo,
      }))
      .filter((item) => item.cantidad <= minimo);
  }

  const cantidad = valorNumerico(producto?.cantidad);
  if (cantidad > minimo) return [];
  return [{
    nombre: producto?.nombre || 'Producto',
    variante: '',
    cantidad,
    deposito: valorNumerico(producto?.deposito),
    minimo,
  }];
};

export const construirAlertaStockBajo = (productos = []) => {
  const vistos = new Set();
  const grupos = [];

  for (const producto of productos) {
    if (!producto) continue;
    const id = String(producto._id || producto.id || producto.nombre || '');
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);

    const items = variantesEnStockBajo(producto);
    if (items.length > 0) grupos.push({ nombre: producto.nombre || 'Producto', items });
  }

  const total = grupos.reduce((suma, grupo) => suma + grupo.items.length, 0);
  if (total === 0) return null;

  const todos = grupos.flatMap((grupo) => grupo.items);
  const sinStock = todos.every((item) => item.cantidad === 0);
  const mezcla = !sinStock && todos.some((item) => item.cantidad === 0);
  const titulo = sinStock ? 'Sin stock' : mezcla ? 'Stock bajo y sin stock' : 'Stock bajo';

  const visibles = [];
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      if (visibles.length >= 3) break;
      visibles.push({ ...item, nombre: grupo.nombre });
    }
    if (visibles.length >= 3) break;
  }

  const porNombre = new Map();
  for (const item of visibles) {
    if (!porNombre.has(item.nombre)) porNombre.set(item.nombre, []);
    porNombre.get(item.nombre).push(item);
  }

  const partes = [...porNombre.entries()].map(([nombre, items]) => {
    const detalle = items
      .map((item) => {
        const variante = item.variante ? ` · ${item.variante}` : '';
        const deposito = item.deposito > 0 ? ` · Dep: ${item.deposito}` : '';
        return `${variante}: ${unidades(item.cantidad)} (mín. ${item.minimo})${deposito}`;
      })
      .join(' · ');
    return `${nombre}${detalle}`;
  });

  if (total > visibles.length) partes.push(`+${total - visibles.length} más`);

  return {
    tipo: 'stock',
    titulo,
    mensaje: partes.join('; '),
    url: RUTAS.PRODUCTOS,
    para: 'admins',
  };
};

export const resumenArticulos = (articulos = [], limite = 3) => {
  if (!Array.isArray(articulos) || articulos.length === 0) return '';
  const items = articulos.map((item) => {
    const cantidad = valorNumerico(item?.cantidad);
    const nombre = item?.nombre || item?.producto?.nombre || 'Producto';
    const variante = etiquetaVariante(item?.talle, item?.color);
    return `${cantidad} ${nombre}${variante ? ` (${variante})` : ''}`;
  });
  const visibles = items.slice(0, limite);
  const restantes = items.length - visibles.length;
  return `${visibles.join(' + ')}${restantes > 0 ? ` +${restantes} más` : ''}`;
};

const TITULOS_MOVIMIENTO = {
  ingreso_deposito: 'Ingreso a depósito',
  ajuste_deposito: 'Ajuste de depósito',
  reposicion: 'Reposición a salón',
  retiro_deposito: 'Retiro a depósito',
  ajuste_salon: 'Ajuste de salón',
};

export const construirEventoMovimientoStock = ({
  tipo,
  producto,
  talle = '',
  color = '',
  cantidad,
  signo = '',
  empleado = '',
}) => {
  const titulo = TITULOS_MOVIMIENTO[tipo];
  if (!titulo || !producto) return null;

  const { salon, deposito } = stockDeProducto(producto, talle, color);
  const nombre = nombreConVariante(producto.nombre, talle, color);
  const partes = [nombre, `${signo}${valorNumerico(cantidad)} u.`];

  if (tipo === 'ingreso_deposito' || tipo === 'ajuste_deposito') {
    partes.push(`Dep: ${deposito}`);
  } else if (tipo === 'reposicion' || tipo === 'retiro_deposito') {
    partes.push(`Salón: ${salon}`, `Dep: ${deposito}`);
    const estado = estadoSalon(producto, talle, color);
    if (estado) partes.push(estado);
  } else {
    partes.push(`Salón: ${salon}`);
    if (deposito > 0) partes.push(`Dep: ${deposito}`);
    const estado = estadoSalon(producto, talle, color);
    if (estado) partes.push(estado);
  }

  if (empleado) partes.push(empleado);

  return {
    tipo: 'stock',
    titulo,
    mensaje: partes.join(' · '),
    url: RUTAS.MOVIMIENTOS_STOCK,
    para: 'admins',
  };
};

export const construirEventoMovimientoSalonMasivo = ({ articulos = [], empleado = '' }) => {
  if (articulos.length === 0) return null;
  const total = articulos.reduce((suma, item) => suma + valorNumerico(item.cantidad), 0);
  const nombres = [...new Set(
    articulos
      .map((item) => item?.producto?.nombre || item?.nombre)
      .filter(Boolean)
  )];
  const visibles = nombres.slice(0, 3).join(', ');
  const restantes = nombres.length - Math.min(nombres.length, 3);
  const partes = [
    `${nombres.length} producto${nombres.length === 1 ? '' : 's'}`,
    unidades(total),
    `${visibles}${restantes > 0 ? ` +${restantes}` : ''}`,
  ];
  if (empleado) partes.push(empleado);

  return {
    tipo: 'stock',
    titulo: 'Movimiento a salón',
    mensaje: partes.join(' · '),
    url: RUTAS.MOVIMIENTOS_STOCK,
    para: 'admins',
  };
};

export const describirCambiosProducto = (previo, actual) => {
  const antes = snapshotProducto(previo);
  const despues = snapshotProducto(actual);
  const cambios = [];

  if (antes.nombre !== despues.nombre) {
    cambios.push(`nombre: "${antes.nombre}" → "${despues.nombre}"`);
  }
  if (antes.precio !== despues.precio) {
    cambios.push(`precio: ${formatearMonto(antes.precio)} → ${formatearMonto(despues.precio)}`);
  }
  if (antes.stockMinimo !== despues.stockMinimo) {
    cambios.push(`mínimo: ${antes.stockMinimo} → ${despues.stockMinimo}`);
  }
  if (antes.categoria !== despues.categoria) {
    cambios.push(`categoría: ${antes.categoria || '—'} → ${despues.categoria || '—'}`);
  }
  if (antes.proveedor !== despues.proveedor) {
    cambios.push(`proveedor: ${antes.proveedor || '—'} → ${despues.proveedor || '—'}`);
  }

  const coloresAntes = new Set(antes.colores);
  const coloresDespues = new Set(despues.colores);
  const coloresAgregados = [...coloresDespues].filter((color) => !coloresAntes.has(color));
  const coloresQuitados = [...coloresAntes].filter((color) => !coloresDespues.has(color));
  if (coloresAgregados.length > 0 || coloresQuitados.length > 0) {
    cambios.push(`colores: ${[
      ...coloresAgregados.map((color) => `+${color}`),
      ...coloresQuitados.map((color) => `-${color}`),
    ].join(', ')}`);
  }

  const variantesAntes = new Map(
    antes.variantes.map((variante) => [claveVariante(variante.talle, variante.color), variante])
  );
  const variantesDespues = new Map(
    despues.variantes.map((variante) => [claveVariante(variante.talle, variante.color), variante])
  );
  const variantesAgregadas = [];
  const variantesQuitadas = [];
  const cambiosStockVariantes = [];

  for (const [clave, variante] of variantesDespues) {
    if (!variantesAntes.has(clave)) {
      variantesAgregadas.push(`+${etiquetaVariante(variante.talle, variante.color) || 'Base'}`);
    }
  }
  for (const [clave, variante] of variantesAntes) {
    if (!variantesDespues.has(clave)) {
      variantesQuitadas.push(`-${etiquetaVariante(variante.talle, variante.color) || 'Base'}`);
    }
  }
  for (const [clave, variante] of variantesDespues) {
    const anterior = variantesAntes.get(clave);
    if (!anterior) continue;
    const etiqueta = etiquetaVariante(variante.talle, variante.color) || 'Base';
    if (anterior.deposito !== variante.deposito) {
      cambiosStockVariantes.push(`depósito ${etiqueta}: ${anterior.deposito} → ${variante.deposito}`);
    }
    if (anterior.cantidad !== variante.cantidad) {
      cambiosStockVariantes.push(`salón ${etiqueta}: ${anterior.cantidad} → ${variante.cantidad}`);
    }
  }

  if (variantesAgregadas.length > 0 || variantesQuitadas.length > 0) {
    cambios.push(`variantes: ${[...variantesAgregadas, ...variantesQuitadas].join(', ')}`);
  }
  cambios.push(...cambiosStockVariantes);

  if (antes.variantes.length === 0 && despues.variantes.length === 0) {
    if (antes.cantidad !== despues.cantidad) {
      cambios.push(`salón: ${antes.cantidad} → ${despues.cantidad}`);
    }
    if (antes.deposito !== despues.deposito) {
      cambios.push(`depósito: ${antes.deposito} → ${despues.deposito}`);
    }
  }

  return cambios;
};

const construirEventoProductoSimple = ({ titulo, url, producto, empleado = '' }) => {
  if (!producto) return null;
  const partes = [producto.nombre || 'Producto'];
  if (empleado) partes.push(empleado);
  return {
    tipo: 'producto',
    titulo,
    mensaje: partes.join(' · '),
    url,
    para: 'admins',
  };
};

export const construirEventoProductoCreado = (producto, empleado = '') => {
  if (!producto) return null;
  const stock = producto.variantes?.length > 0
    ? `${producto.variantes.length} variante${producto.variantes.length === 1 ? '' : 's'}`
    : `Salón: ${valorNumerico(producto.cantidad)} · Dep: ${valorNumerico(producto.deposito)}`;
  const partes = [
    producto.nombre || 'Producto',
    formatearMonto(producto.precio),
    stock,
  ];
  if (empleado) partes.push(empleado);
  return {
    tipo: 'producto',
    titulo: 'Producto creado',
    mensaje: partes.join(' · '),
    url: RUTAS.PRODUCTOS,
    para: 'admins',
  };
};

export const construirEventoProductoEditado = ({ producto, cambios = [], empleado = '' }) => {
  if (!producto || cambios.length === 0) return null;
  const visibles = cambios.slice(0, 3);
  const restantes = cambios.length - visibles.length;
  const partes = [
    producto.nombre || 'Producto',
    ...visibles,
  ];
  if (restantes > 0) partes.push(`+${restantes} cambios`);
  if (empleado) partes.push(empleado);
  return {
    tipo: 'producto',
    titulo: 'Producto editado',
    mensaje: partes.join(' · '),
    url: RUTAS.PRODUCTOS,
    para: 'admins',
  };
};

export const construirEventoProductoEliminado = (producto, empleado = '') =>
  construirEventoProductoSimple({
    titulo: 'Producto a papelera',
    url: RUTAS.PAPELERA,
    producto,
    empleado,
  });

export const construirEventoProductoRestaurado = (producto, empleado = '') =>
  construirEventoProductoSimple({
    titulo: 'Producto restaurado',
    url: RUTAS.PRODUCTOS,
    producto,
    empleado,
  });

export const construirEventoProductoEliminadoDefinitivo = (producto, empleado = '') =>
  construirEventoProductoSimple({
    titulo: 'Producto eliminado definitivo',
    url: RUTAS.PAPELERA,
    producto,
    empleado,
  });

export const construirEventoAumentoPrecios = ({
  items = [],
  tipo,
  valor,
  empleado = '',
  deshecho = false,
}) => {
  if (items.length === 0) return null;
  const cantidad = items.length;
  const valorTexto = tipo === 'porcentaje'
    ? `${deshecho ? '' : '+'}${Number(valor) || 0}%`
    : `${deshecho ? '' : '+'}${formatearMonto(valor)}`;
  const nombres = items
    .map((item) => item?.nombre)
    .filter(Boolean)
    .slice(0, 3);
  const restantes = items.length - nombres.length;
  const partes = [
    `${cantidad} producto${cantidad === 1 ? '' : 's'}`,
    valorTexto,
  ];
  if (nombres.length > 0) {
    partes.push(`${nombres.join(', ')}${restantes > 0 ? ` +${restantes}` : ''}`);
  }
  if (empleado) partes.push(empleado);
  return {
    tipo: 'producto',
    titulo: deshecho ? 'Aumento deshecho' : 'Aumento de precios',
    mensaje: partes.join(' · '),
    url: RUTAS.DEPOSITO,
    para: 'admins',
  };
};
