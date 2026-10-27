import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido');

export const schemaCrearDevolucion = z.object({
  producto: objectId,
  cantidad: z.number().int().positive('La cantidad debe ser al menos 1'),
  talle: z.string().trim().max(20, 'El talle es demasiado largo').optional().default(''),
  color: z.string().trim().max(30, 'El color es demasiado largo').optional().default(''),
  motivo: z.string().trim().min(1, 'El motivo es requerido').max(200, 'El motivo es demasiado largo'),
  venta: objectId.optional(),
  offset: z.number().int().optional(),
});
