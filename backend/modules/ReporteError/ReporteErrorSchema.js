import { z } from 'zod';

export const schemaReporteError = z.object({
  mensaje: z.string().min(1, 'El mensaje es requerido').max(1000),
  stack: z.string().max(4000).optional().default(''),
  lugar: z.string().max(500).optional().default(''),
  ruta: z.string().max(300).optional().default(''),
  componente: z.string().max(500).optional().default(''),
  userAgent: z.string().max(500).optional().default(''),
  contexto: z.record(z.unknown()).optional().default({}),
});
