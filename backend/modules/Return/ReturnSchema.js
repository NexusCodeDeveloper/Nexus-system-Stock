import { z } from 'zod';
import { Types } from 'mongoose';

const objectId = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'ID de producto inválido',
});

export const createReturnSchema = z.object({
  producto: objectId,
  cantidad: z.number().int().positive('La cantidad debe ser al menos 1'),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
  motivo: z.string().min(1, 'El motivo es requerido'),
  sale: objectId.optional(),
});
