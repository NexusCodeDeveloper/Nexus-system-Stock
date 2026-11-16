import mongoose from 'mongoose';

export const HORA_MS = 60 * 60 * 1000;
export const INACTIVIDAD_MAX_MS = 8 * HORA_MS;
export const SESION_MAX_HORAS = 24;
// Solo se extiende la sesión si pasó al menos esto desde la última renovación (evita escribir en cada request)
export const REFRESCO_MIN_MS = HORA_MS;

const sesionSchema = new mongoose.Schema(
  {
    usuarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
    jti: {
      type: String,
      required: true,
      unique: true,
    },
    expiraEn: {
      type: Date,
      required: true,
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: false } }
);

sesionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Sesion', sesionSchema, 'sesiones');
