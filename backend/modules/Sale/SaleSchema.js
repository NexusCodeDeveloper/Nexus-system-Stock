import { z } from 'zod';

const pagoSchema = z.object({
  metodo: z.enum(['efectivo', 'transferencia', 'tarjeta']),
  monto: z.number().min(0, 'El monto debe ser mayor o igual a 0'),
});

const itemSchema = z.object({
  producto: z.string().min(1, 'Producto requerido'),
  cantidad: z.number().int().positive('Debe vender al menos 1'),
  precio: z.number().min(0, 'Precio debe ser mayor o igual a 0'),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
});

export const createSaleSchema = z.object({
  items: z.array(itemSchema).min(1, 'Debe incluir al menos un producto'),
  empleado: z.string().min(1, 'El nombre del empleado es requerido'),
  pagos: z.array(pagoSchema).min(1).max(2),
  descuento: z.number().min(0).max(100).optional().default(0),
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
