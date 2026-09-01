import { z } from 'zod';
import { Types } from 'mongoose';

const objectId = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'ID inválido',
});

const variantSchema = z.object({
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
  cantidad: z.number().int().min(0, 'La cantidad no puede ser negativa'),
});

export const createProductSchema = z.object({
  nombre: z.string().min(1, 'El nombre del producto es obligatorio'),
  precio: z.number().positive('El precio debe ser mayor a $0'),
  cantidad: z.number().int().min(0, 'La cantidad no puede ser negativa').optional().default(0),
  variants: z.array(variantSchema).optional().default([]),
  colores: z.array(z.string()).optional().default([]),
  categoria: z.string().min(1, 'La categoría es obligatoria'),
  proveedor: z.string().optional().default(''),
  stockMinimo: z.number().int().min(0).optional().default(2),
}).superRefine((data, ctx) => {
  if (data.colores && data.colores.length > 0) {
    for (const v of data.variants ?? []) {
      if (v.color && !data.colores.includes(v.color)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El color "${v.color}" no está en la lista de colores del producto`,
          path: ['variants'],
        });
      }
    }
  }
});

export const exchangeSchema = z.object({
  productoDevolver: objectId,
  cantidadDevolver: z.number().int().positive('Debe devolver al menos 1'),
  talleDevolver: z.string().optional().default(''),
  colorDevolver: z.string().optional().default(''),
  productoCargar: objectId,
  cantidadCargar: z.number().int().positive('Debe cargar al menos 1'),
  talleCargar: z.string().optional().default(''),
  colorCargar: z.string().optional().default(''),
  motivo: z.string().optional().default('Cambio'),
  sale: objectId.optional(),
  metodoPago: z.enum(['efectivo', 'transferencia', 'tarjeta']).optional(),
  empleado: z.string().optional(),
});

export const addStockSchema = z.object({
  cantidad: z.number().int().positive('Debe agregar al menos 1'),
  talle: z.string().optional().default(''),
  color: z.string().optional().default(''),
});

export const updateProductSchema = z.object({
  nombre: z.string().min(1, 'El nombre del producto es obligatorio').optional(),
  precio: z.number().positive('El precio debe ser mayor a $0').optional(),
  cantidad: z.number().int().min(0, 'La cantidad no puede ser negativa').optional(),
  variants: z.array(variantSchema).optional(),
  colores: z.array(z.string()).optional(),
  categoria: z.string().min(1, 'La categoría es obligatoria').optional(),
  proveedor: z.string().optional(),
  stockMinimo: z.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.colores && data.colores.length > 0) {
    for (const v of data.variants ?? []) {
      if (v.color && !data.colores.includes(v.color)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El color "${v.color}" no está en la lista de colores del producto`,
          path: ['variants'],
        });
      }
    }
  }
});