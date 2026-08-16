import { z } from 'zod';

export const createSupplierSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  direccion: z.string().optional(),
});

export const updateSupplierSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  direccion: z.string().optional(),
});
