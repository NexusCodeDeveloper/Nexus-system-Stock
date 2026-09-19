import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido');

const pagoSchema = z.object({
  metodo: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  monto: z.number().finite().min(0, 'El monto debe ser mayor o igual a 0'),
});

const itemSchema = z.object({
  producto: objectId,
  cantidad: z.number().int().positive('Debe vender al menos 1'),
  precio: z.number().finite().min(0, 'Precio debe ser mayor o igual a 0').optional(),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
});

export const schemaCrearVenta = z.object({
  articulos: z.array(itemSchema).min(1, 'Debe incluir al menos un producto'),
  empleado: z.string().min(1, 'El nombre del empleado es requerido').optional(),
  pagos: z.array(pagoSchema).min(1).max(2),
  descuento: z.number().finite().min(0).max(100).optional().default(0),
  offset: z.number().int().optional(),
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
});

const nombreCaja = z
  .string({ required_error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre es obligatorio')
  .max(80, 'El nombre es demasiado largo');

export const schemaAbrirCaja = z.object({
  nombre: nombreCaja,
  fondoInicial: z.number().finite().min(0, 'El fondo no puede ser negativo').optional().default(0),
  offset: z.number().int().optional(),
});

export const schemaCerrarCaja = z.object({
  nombre: nombreCaja,
  offset: z.number().int().optional(),
});

export const schemaReabrirCaja = z.object({
  nombre: nombreCaja,
  offset: z.number().int().optional(),
});
