import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido');

const fecha = z
  .string()
  .refine((valor) => !Number.isNaN(new Date(valor).getTime()), 'La fecha es inválida');

export const schemaCrearPromocion = z
  .object({
    nombre: z.string().trim().max(60, 'El nombre es demasiado largo').optional().default(''),
    tipo: z.enum(['porcentaje', 'monto'], {
      errorMap: () => ({ message: 'El tipo de descuento es inválido' }),
    }),
    valor: z.number('El descuento debe ser un número').finite('El descuento debe ser un número').positive('El descuento debe ser mayor a 0').max(99999999.99, 'El descuento es demasiado alto'),
    desde: fecha,
    hasta: fecha,
    todos: z.boolean().optional().default(false),
    productos: z.array(objectId).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'porcentaje' && data.valor > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valor'],
        message: 'El porcentaje no puede superar el 100%',
      });
    }
    const desde = new Date(data.desde);
    const hasta = new Date(data.hasta);
    if (hasta <= desde) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hasta'],
        message: 'La fecha de fin debe ser posterior a la de inicio',
      });
    }
    if (!data.todos && data.productos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productos'],
        message: 'Seleccioná al menos un producto',
      });
    }
  });
