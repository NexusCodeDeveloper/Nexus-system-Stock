import { z } from 'zod';

const nombre = z.string().trim().min(1, 'El nombre es requerido').max(80, 'El nombre es demasiado largo');
const telefono = z.string().trim().max(40, 'El teléfono es demasiado largo').optional().default('');
const email = z
  .string()
  .trim()
  .max(254, 'El email es demasiado largo')
  .email('Email inválido')
  .optional()
  .or(z.literal(''));
const direccion = z.string().trim().max(160, 'La dirección es demasiado larga').optional().default('');

export const schemaCrearProveedor = z.object({
  nombre,
  telefono,
  email,
  direccion,
});

export const schemaActualizarProveedor = z.object({
  nombre: nombre.optional(),
  telefono: telefono.optional(),
  email,
  direccion: direccion.optional(),
});
