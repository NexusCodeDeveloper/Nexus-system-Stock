import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido');
const objectIdCliente = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Cliente inválido');

const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'cuentaCorriente'];

const pagoSchema = z.object({
  metodo: z.enum(METODOS_PAGO, {
    errorMap: () => ({ message: 'El método de pago es inválido' }),
  }),
  monto: z.number().finite().min(0, 'El monto debe ser mayor o igual a 0').max(9999999.99, 'El monto es demasiado alto'),
});

const itemSchema = z.object({
  producto: objectId,
  cantidad: z.number().int().positive('Debe vender al menos 1'),
  precio: z.number().finite().min(0, 'Precio debe ser mayor o igual a 0').max(99999999.99, 'El precio es demasiado alto').optional(),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
});

/** Plan de cuotas que elige el vendedor al cargar la venta a cuenta corriente. */
const planCuotasSchema = z.object({
  cantidadCuotas: z
    .number('La cantidad de cuotas debe ser un número')
    .int('La cantidad de cuotas debe ser un número entero')
    .min(1, 'Debe haber al menos 1 cuota')
    .max(24, 'No se pueden hacer más de 24 cuotas')
    .optional()
    .default(1),
  aplicarInteres: z.boolean().optional().default(false),
  interesPorcentaje: z
    .number('El interés debe ser un número')
    .finite('El interés debe ser un número')
    .min(0, 'El interés no puede ser negativo')
    .max(1000, 'El interés es demasiado alto')
    .optional()
    .default(0),
  tasaMoraMensual: z
    .number('La tasa de mora debe ser un número')
    .finite('La tasa de mora debe ser un número')
    .min(0, 'La tasa de mora no puede ser negativa')
    .max(1000, 'La tasa de mora es demasiado alta')
    .optional()
    .default(0),
  primerVencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha del primer vencimiento es inválida')
    .optional(),
});

export const schemaCrearVenta = z.object({
  articulos: z.array(itemSchema).min(1, 'Debe incluir al menos un producto'),
  empleado: z.string().trim().min(1, 'El nombre del empleado es requerido').max(80, 'El nombre del empleado es demasiado largo').optional(),
  pagos: z.array(pagoSchema).min(1).max(3, 'No se pueden usar más de 3 métodos de pago'),
  descuento: z.number().finite().min(0).max(100).optional().default(0),
  offset: z.number().int().optional(),
  cliente: objectIdCliente.optional(),
  planCuotas: planCuotasSchema.optional(),
}).superRefine((data, ctx) => {
  const vistos = new Set();
  for (const p of data.pagos) {
    if (vistos.has(p.metodo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se puede usar dos veces el mismo método de pago',
      });
      break;
    }
    vistos.add(p.metodo);
  }

  if (data.pagos.some((p) => p.metodo === 'cuentaCorriente') && !data.cliente) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cliente'],
      message: 'Para cargar a la cuenta corriente indicá el cliente',
    });
  }
});

const nombreCaja = z
  .string({ required_error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre es obligatorio')
  .max(80, 'El nombre es demasiado largo');

export const schemaAbrirCaja = z.object({
  nombre: nombreCaja,
  fondoInicial: z.number().finite().min(0, 'El fondo no puede ser negativo').max(9999999.99, 'El fondo es demasiado alto').optional().default(0),
  offset: z.number().int().optional(),
});

export const schemaCerrarCaja = z.object({
  nombre: nombreCaja,
  turno: z
    .enum(['manana', 'tarde', 'dia'], {
      errorMap: () => ({ message: 'El turno es inválido. Usá mañana, tarde o día completo' }),
    })
    .optional()
    .default('dia'),
  enviarReporteDia: z.boolean().optional().default(false),
  offset: z.number().int().optional(),
});

export const schemaReenviarReporteDia = z.object({
  fecha: z.string({ required_error: 'La fecha es obligatoria' }).min(1, 'La fecha es obligatoria'),
  offset: z.number().int().optional(),
});
