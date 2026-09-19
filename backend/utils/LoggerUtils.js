import winston from 'winston';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const logDir = path.resolve(__dirname, '..', 'logs');

const CAMPOS_SENSIBLES = [
  'clave',
  'token',
  'authorization',
  'jwt',
  'secret',
  'apikey',
  'api_key',
  'p256dh',
  'privatekey',
];

const ETIQUETAS_NIVEL = {
  error: '[ERROR]',
  warn: '[AVISO]',
  info: '[INFO]',
  debug: '[DEBUG]',
};

const COLORES = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[32m',
  debug: '\x1b[34m',
};
const SIN_COLOR = '\x1b[0m';

const ETIQUETAS = {
  motivo: 'Motivo',
  detalle: 'Detalle',
  peticion: 'Petición',
  codigo: 'Código',
  donde: 'Dónde',
  lugar: 'Dónde',
  seguimiento: 'Seguimiento',
  quien: 'Quién',
  usuario: 'Usuario',
  rol: 'Rol',
  ip: 'IP',
  navegador: 'Navegador',
  ruta: 'Ruta',
  componente: 'Componente',
  queRevisar: 'Qué revisar',
  duracion: 'Duración',
  origen: 'Origen',
  errores: 'Errores',
  datos: 'Datos',
  puerto: 'Puerto',
  entorno: 'Entorno',
  servidor: 'Servidor',
  nivelDeDetalle: 'Nivel de detalle',
};

const ORDEN_CAMPOS = [
  'motivo',
  'detalle',
  'peticion',
  'codigo',
  'donde',
  'lugar',
  'seguimiento',
  'quien',
  'usuario',
  'rol',
  'ip',
  'navegador',
  'ruta',
  'componente',
  'duracion',
  'queRevisar',
  'errores',
  'datos',
  'origen',
  'puerto',
  'entorno',
  'servidor',
  'nivelDeDetalle',
];

const redactar = (valor, profundidad = 0) => {
  if (valor === null || valor === undefined || profundidad > 4) return valor;
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (typeof valor === 'object') {
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) {
      salida[clave] = CAMPOS_SENSIBLES.includes(clave.toLowerCase())
        ? '[REDACTADO]'
        : redactar(v, profundidad + 1);
    }
    return salida;
  }
  return valor;
};

const formatoRedaccion = winston.format((info) => {
  for (const clave of Object.keys(info)) {
    if (CAMPOS_SENSIBLES.includes(clave.toLowerCase())) {
      info[clave] = '[REDACTADO]';
    } else if (info[clave] && typeof info[clave] === 'object') {
      info[clave] = redactar(info[clave]);
    }
  }
  return info;
});

const formatearValor = (valor) => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
};

const formatoConsola = winston.format.printf((info) => {
  const { timestamp, level, message, stack, ...meta } = info;
  const hora = timestamp ? String(timestamp).slice(11, 19) : '';
  const etiqueta = `${COLORES[level] || ''}${ETIQUETAS_NIVEL[level] || `[${String(level).toUpperCase()}]`}${SIN_COLOR}`;

  const extras = [];
  if (meta.quien) extras.push(`quién=${meta.quien}`);
  if (meta.usuario && !meta.quien) extras.push(`usuario=${meta.usuario}`);
  if (meta.ip) extras.push(`IP ${meta.ip}`);
  if (meta.duracion !== undefined && meta.duracion !== null) extras.push(`${meta.duracion} ms`);
  if (meta.seguimiento) extras.push(`petición ${String(meta.seguimiento).slice(0, 8)}`);

  if (meta.compacto) {
    const cola = extras.length ? ` · ${extras.join(' · ')}` : '';
    return `${etiqueta} ${hora} · ${message}${cola}`;
  }

  const lineas = [`${etiqueta} ${hora}`];
  if (message) lineas.push(`   ${message}`);

  const usados = new Set(['compacto']);
  for (const clave of ORDEN_CAMPOS) {
    const valor = meta[clave];
    if (valor === undefined || valor === null || valor === '') continue;
    usados.add(clave);
    const etiquetaCampo = `${(ETIQUETAS[clave] || clave).padEnd(12)} `;
    lineas.push(`   ${etiquetaCampo}${formatearValor(valor)}`);
  }

  const resto = Object.entries(meta).filter(
    ([clave, valor]) =>
      !usados.has(clave) &&
      !clave.startsWith('Symbol') &&
      valor !== undefined &&
      valor !== null &&
      valor !== ''
  );
  if (resto.length > 0) {
    lineas.push(`   ${resto.map(([clave, valor]) => `${ETIQUETAS[clave] || clave}: ${formatearValor(valor)}`).join(' · ')}`);
  }

  if (stack) {
    lineas.push('   Pila:');
    lineas.push(String(stack).split('\n').map((l) => `      ${l.trim()}`).join('\n'));
  }

  return lineas.join('\n');
});

const formatoJsonEspanol = winston.format((info) => {
  info.fecha = info.timestamp;
  info.nivel = info.level;
  info.mensaje = info.message;
  if (info.stack) {
    info.pila = info.stack;
    delete info.stack;
  }
  delete info.timestamp;
  delete info.level;
  delete info.message;
  delete info.compacto;
  return info;
});

const formatoBase = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  formatoRedaccion(),
];

const transports = [
  new winston.transports.Console({
    format: isDev
      ? winston.format.combine(...formatoBase, formatoConsola)
      : winston.format.combine(...formatoBase, formatoJsonEspanol(), winston.format.json()),
  }),
];

if (isDev) {
  fs.mkdirSync(logDir, { recursive: true });
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'warn',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      format: winston.format.combine(...formatoBase, formatoJsonEspanol(), winston.format.json()),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transports,
  exitOnError: false,
});

export const lugarDesdePila = (stack) => {
  if (!stack) return null;
  const lineas = String(stack)
    .split('\n')
    .filter((l) => l.trim().startsWith('at '));
  const propia = lineas.find((l) => /[/\\]backend[/\\]/.test(l) && !l.includes('node_modules'));
  const frame = (propia || lineas[0] || '').trim().replace(/^at\s+/, '').replace(/^async\s+/, '');
  if (!frame) return null;

  const funcion = frame.match(/^([^\s(]+)/)?.[1] || '';
  const ubicacion = frame.match(/([^/\\:\s()]+\.js:\d+:\d+)/)?.[1];
  if (!ubicacion) return frame;
  return funcion && !funcion.includes('.js:') ? `${ubicacion} → ${funcion}` : ubicacion;
};

export default logger;
