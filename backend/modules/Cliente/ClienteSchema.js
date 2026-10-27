import { z } from 'zod';

const nombre = z.string().min(1, 'El nombre es requerido').trim().max(80, 'El nombre es demasiado largo');
const documento = z.string().trim().max(30, 'El documento es demasiado largo').optional().default('');
const telefono = z.string().trim().max(40, 'El teléfono es demasiado largo').optional().default('');
const email = z
  .string()
  .trim()
  .max(254, 'El email es demasiado largo')
  .email('Email inválido')
  .optional()
  .or(z.literal(''));
const direccion = z.string().trim().max(160, 'La dirección es demasiado larga').optional().default('');

export const schemaCrearCliente = z.object({
  nombre,
  documento,
  telefono,
  email,
  direccion,
});

export const schemaActualizarCliente = z.object({
  nombre: nombre.optional(),
  documento: documento.optional(),
  telefono: telefono.optional(),
  email,
  direccion: direccion.optional(),
});
