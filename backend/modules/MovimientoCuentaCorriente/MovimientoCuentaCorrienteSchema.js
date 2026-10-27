import { z } from 'zod';
import { parsearFecha } from '../../utils/FechasUtils.js';
import {
  TIPOS_MOVIMIENTO,
  ORIGENES_MOVIMIENTO,
  ORIGENES_SISTEMA,
  FORMAS_PAGO,
} from './MovimientoCuentaCorrienteModel.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Cliente inválido');

const monto = z
  .number('El monto debe ser un número')
  .finite('El monto debe ser un número')
  .positive('El monto debe ser mayor a 0')
  .max(9999999.99, 'El monto es demasiado alto');

/** 'fecha' es una fecha de calendario, asi que se guarda en UTC sin corrimiento de zona horaria. */
const fecha = z
  .string()
  .refine((valor) => parsearFecha(valor) !== null, 'La fecha es inválida')
  .optional();

/** Los orígenes de interés y mora los genera el sistema, no se cargan a mano. */
const origen = z
  .enum(ORIGENES_MOVIMIENTO, {
    errorMap: () => ({ message: 'El origen del movimiento es inválido' }),
  })
  .refine((valor) => !ORIGENES_SISTEMA.includes(valor), 'Ese origen lo genera el sistema automáticamente');

/** Qué tipo admite cada origen. 'ajuste' admite débito y crédito. */
export const TIPOS_POR_ORIGEN = {
  pago: ['credito'],
  devolucion: ['credito'],
  factura: ['debito'],
  venta: ['debito'],
  ajuste: ['debito', 'credito'],
};

/** Devuelve el mensaje de error si la combinación tipo/origen no tiene sentido, o null si es válida. */
export const validarCoherenciaTipoOrigen = (tipo, origenMovimiento) => {
  const permitidos = TIPOS_POR_ORIGEN[origenMovimiento];
  if (!permitidos || permitidos.includes(tipo)) return null;
  if (origenMovimiento === 'pago') return 'Un pago debe registrarse como crédito (baja la deuda)';
  if (origenMovimiento === 'devolucion') return 'Una devolución debe registrarse como crédito (baja la deuda)';
  if (origenMovimiento === 'factura' || origenMovimiento === 'venta') {
    return `El origen "${origenMovimiento}" debe registrarse como débito (suma deuda)`;
  }
  return `El origen "${origenMovimiento}" solo admite movimientos de tipo ${permitidos.join(' o ')}`;
};

const campos = {
  tipo: z.enum(TIPOS_MOVIMIENTO, {
    errorMap: () => ({ message: 'El tipo de movimiento debe ser debito o credito' }),
  }),
  origen,
  monto,
  formaPago: z.enum(FORMAS_PAGO, {
    errorMap: () => ({ message: 'La forma de pago es inválida' }),
  }),
  fecha,
  referencia: z.string().trim().max(60, 'La referencia es demasiado larga').optional().default(''),
  nota: z.string().trim().max(300, 'La nota es demasiado larga').optional().default(''),
};

export const schemaCrearMovimiento = z
  .object({
    ...campos,
    cliente: objectId.optional(),
  })
  .superRefine((data, ctx) => {
    const incoherencia = validarCoherenciaTipoOrigen(data.tipo, data.origen);
    if (incoherencia) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipo'], message: incoherencia });
    }
  });

export const schemaActualizarMovimiento = z
  .object({
    tipo: campos.tipo.optional(),
    origen: campos.origen.optional(),
    monto: campos.monto.optional(),
    formaPago: campos.formaPago.optional(),
    fecha: campos.fecha,
    referencia: campos.referencia.optional(),
    nota: campos.nota.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo && data.origen) {
      const incoherencia = validarCoherenciaTipoOrigen(data.tipo, data.origen);
      if (incoherencia) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipo'], message: incoherencia });
      }
    }
  });

export const schemaAnularMovimiento = z.object({
  motivo: z.string().trim().min(1, 'Indicá el motivo de la anulación').max(200, 'El motivo es demasiado largo'),
});
