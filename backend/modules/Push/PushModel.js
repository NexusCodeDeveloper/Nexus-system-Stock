import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    email: { type: String, default: '' },
    nombre: { type: String, default: '' },
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    rol: { type: String, default: 'user' },
    actualizadoAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' } }
);

pushSubscriptionSchema.index({ rol: 1 });
pushSubscriptionSchema.index({ nombre: 1 });
pushSubscriptionSchema.index({ usuarioId: 1 });

export default mongoose.model('SuscripcionPush', pushSubscriptionSchema, 'suscripcionesPush');