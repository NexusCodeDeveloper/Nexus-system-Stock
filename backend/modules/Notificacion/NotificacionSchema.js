import { z } from 'zod';

export const schemaCrearNotificacion = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
});

export const schemaActualizarNotificacion = z.object({
  titulo: z.string().min(1, 'El título es requerido').optional(),
  descripcion: z.string().min(1, 'La descripción es requerida').optional(),
});

export const schemaCompletarNotificacion = z.object({
  realizadoNombre: z.string().min(1, 'Debe indicar quién realizó la tarea').optional(),
  comentario: z.string().optional().default(''),
});