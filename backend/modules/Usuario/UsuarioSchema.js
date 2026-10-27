import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El email es demasiado largo')
  .email('Email inválido');

const nombresValidos = z.string().trim().min(1, 'El nombre es requerido').max(80, 'El nombre es demasiado largo');

const claveValida = z
  .string()
  .min(6, 'La contraseña debe tener al menos 6 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres');

const rolValido = z.enum(['admin', 'user']);

export const crearUsuarioSchema = z.object({
  nombre: nombresValidos,
  email,
  clave: claveValida,
  rol: rolValido.default('user'),
  activo: z.boolean().optional().default(true),
});

export const actualizarUsuarioSchema = z.object({
  nombre: nombresValidos.optional(),
  email: email.optional(),
  rol: rolValido.optional(),
});

export const claveUsuarioSchema = z.object({
  clave: claveValida,
});

export const activoUsuarioSchema = z.object({
  activo: z.boolean(),
});