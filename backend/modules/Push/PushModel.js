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
    rol: { type: String, default: 'user' },
    actualizadoAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ rol: 1 });
pushSubscriptionSchema.index({ nombre: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);