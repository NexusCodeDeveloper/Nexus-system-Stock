import { z } from 'zod';

export const createNotificationSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
});

export const updateNotificationSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido').optional(),
  descripcion: z.string().min(1, 'La descripción es requerida').optional(),
});

export const completeNotificationSchema = z.object({
  realizadoNombre: z.string().min(1, 'Debe indicar quién realizó la tarea'),
  comentario: z.string().optional().default(''),
});