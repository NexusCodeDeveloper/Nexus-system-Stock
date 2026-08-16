import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'realizado'],
      default: 'pendiente',
    },
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    realizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    realizadoNombre: {
      type: String,
      trim: true,
      default: '',
    },
    realizadoEn: {
      type: Date,
      default: null,
    },
    comentario: {
      type: String,
      trim: true,
      default: '',
    },
    nuevaParaAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ estado: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);