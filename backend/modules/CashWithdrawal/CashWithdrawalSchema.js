import { z } from 'zod';

export const createCashWithdrawalSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a $0'),
  motivo: z.string().min(1, 'El motivo es requerido'),
  realizadoPor: z.string().min(1, 'Debe indicar quién retira el efectivo'),
});