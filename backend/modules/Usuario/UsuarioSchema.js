import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Email inválido');

const nombresValidos = z.string().trim().min(1, 'El nombre es requerido');

const rolValido = z.enum(['admin', 'user']);

export const crearUsuarioSchema = z.object({
  nombre: nombresValidos,
  email,
  clave: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  rol: rolValido.default('user'),
  activo: z.boolean().optional().default(true),
});

export const actualizarUsuarioSchema = z.object({
  nombre: nombresValidos.optional(),
  email: email.optional(),
  rol: rolValido.optional(),
});

export const claveUsuarioSchema = z.object({
  clave: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export const activoUsuarioSchema = z.object({
  activo: z.boolean(),
});