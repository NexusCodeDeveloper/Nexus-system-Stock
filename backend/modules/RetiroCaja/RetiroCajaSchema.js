import { z } from 'zod';

export const schemaCrearRetiroCaja = z.object({
  monto: z.number().finite().positive('El monto debe ser mayor a $0'),
  motivo: z.string().min(1, 'El motivo es requerido'),
  realizadoPor: z.string().min(1, 'Debe indicar quién retira el efectivo').optional(),
});
