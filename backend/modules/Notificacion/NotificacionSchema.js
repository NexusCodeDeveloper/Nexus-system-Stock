import { z } from 'zod';

const destinatarioSchema = z
  .union([
    z.string().regex(/^[0-9a-fA-F]{24}$/, 'El empleado seleccionado no es válido'),
    z.literal(''),
    z.null(),
  ])
  .transform((valor) => valor || null);

export const schemaCrearNotificacion = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  destinatario: destinatarioSchema.optional(),
});

export const schemaActualizarNotificacion = z.object({
  titulo: z.string().min(1, 'El título es requerido').optional(),
  descripcion: z.string().min(1, 'La descripción es requerida').optional(),
  destinatario: destinatarioSchema.optional(),
});

export const schemaCompletarNotificacion = z.object({
  realizadoNombre: z.string().min(1, 'Debe indicar quién realizó la tarea').optional(),
  comentario: z.string().optional().default(''),
});
