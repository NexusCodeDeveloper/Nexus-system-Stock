import { z } from 'zod';

export const schemaCrearRetiroCaja = z.object({
  monto: z.number().finite().positive('El monto debe ser mayor a $0').max(9999999.99, 'El monto es demasiado alto'),
  motivo: z.string().trim().min(1, 'El motivo es requerido').max(200, 'El motivo es demasiado largo'),
  realizadoPor: z
    .string()
    .trim()
    .min(1, 'Debe indicar quién retira el efectivo')
    .max(80, 'El nombre es demasiado largo')
    .optional(),
});
