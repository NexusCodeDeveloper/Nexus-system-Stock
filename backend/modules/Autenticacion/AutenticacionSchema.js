import { z } from 'zod';

export const iniciarSesionSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  clave: z.string().min(1, 'La contraseña es requerida'),
});
