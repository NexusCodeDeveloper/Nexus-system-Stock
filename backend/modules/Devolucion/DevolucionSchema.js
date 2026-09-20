import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido');

export const schemaCrearDevolucion = z.object({
  producto: objectId,
  cantidad: z.number().int().positive('La cantidad debe ser al menos 1'),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
  motivo: z.string().min(1, 'El motivo es requerido'),
  venta: objectId.optional(),
  offset: z.number().int().optional(),
});
