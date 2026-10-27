import { z } from 'zod';

const titulo = z.string().trim().min(1, 'El título es requerido').max(100, 'El título es demasiado largo');
const descripcion = z.string().trim().min(1, 'La descripción es requerida').max(500, 'La descripción es demasiado larga');

const destinatarioSchema = z
  .union([
    z.string().regex(/^[0-9a-fA-F]{24}$/, 'El empleado seleccionado no es válido'),
    z.literal(''),
    z.null(),
  ])
  .transform((valor) => valor || null);

export const schemaCrearNotificacion = z.object({
  titulo,
  descripcion,
  destinatario: destinatarioSchema.optional(),
});

export const schemaActualizarNotificacion = z.object({
  titulo: titulo.optional(),
  descripcion: descripcion.optional(),
  destinatario: destinatarioSchema.optional(),
});

export const schemaCompletarNotificacion = z.object({
  realizadoNombre: z.string().trim().min(1, 'Debe indicar quién realizó la tarea').max(80, 'El nombre es demasiado largo').optional(),
  comentario: z.string().trim().max(300, 'El comentario es demasiado largo').optional().default(''),
});
