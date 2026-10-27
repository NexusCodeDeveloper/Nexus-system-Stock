import { z } from 'zod';

export const iniciarSesionSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'El email es demasiado largo')
    .email('Email inválido'),
  clave: z
    .string()
    .min(1, 'La contraseña es requerida')
    .max(72, 'La contraseña no puede superar los 72 caracteres'),
});
