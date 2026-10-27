import { z } from 'zod';

export const schemaCrearSolicitud = z.object({
  datos: z.object({
    nombre: z.string().min(1, 'El nombre es requerido').trim().max(80, 'El nombre es demasiado largo'),
    documento: z.string().trim().max(30, 'El documento es demasiado largo').optional().default(''),
    telefono: z.string().trim().max(40, 'El teléfono es demasiado largo').optional().default(''),
    email: z
      .string()
      .trim()
      .max(254, 'El email es demasiado largo')
      .email('Email inválido')
      .optional()
      .or(z.literal('')),
    direccion: z.string().trim().max(160, 'La dirección es demasiado larga').optional().default(''),
  }),
});

export const schemaRechazarSolicitud = z.object({
  motivo: z.string().trim().min(1, 'Indicá el motivo del rechazo').max(200, 'El motivo es demasiado largo'),
});
