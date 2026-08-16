import mongoose from 'mongoose';

const dailyCloseSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
  },
  turno: { type: String, enum: ['manana', 'tarde'] },
  desdeAt: { type: Date },
  hastaAt: { type: Date },
  total: { type: Number, required: true },
  cantidad: { type: Number, required: true },
  efectivo: {
    total: { type: Number, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  transferencia: {
    total: { type: Number, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  tarjeta: {
    total: { type: Number, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  cerradoPor: { type: String, default: '' },
  cerradoAt: { type: Date, default: Date.now },
});

dailyCloseSchema.index({ fecha: 1, turno: 1 }, { unique: true });

export default mongoose.model('DailyClose', dailyCloseSchema);