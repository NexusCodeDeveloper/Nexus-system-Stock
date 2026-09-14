import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/money.js';

const dailyCloseSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
  },
  turno: { type: String, enum: ['manana', 'tarde'] },
  desdeAt: { type: Date },
  hastaAt: { type: Date },
  total: { ...campoCentavosPositivo, required: true },
  cantidad: { type: Number, required: true },
  efectivo: {
    total: { ...campoCentavosPositivo, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  transferencia: {
    total: { ...campoCentavosPositivo, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  tarjeta: {
    total: { ...campoCentavosPositivo, default: 0 },
    cantidad: { type: Number, default: 0 },
  },
  cerradoPor: { type: String, default: '' },
  cerradoAt: { type: Date, default: Date.now },
  retiros: [{
    monto: { ...campoCentavosPositivo, required: true },
    motivo: { type: String, trim: true, default: '' },
    realizadoPor: { type: String, trim: true, default: '' },
    fecha: { type: Date, default: Date.now },
  }],
  totalRetiros: { ...campoCentavosPositivo, default: 0 },
}, { toJSON: { getters: true } });

dailyCloseSchema.index({ fecha: 1, turno: 1 }, { unique: true });

export default mongoose.model('DailyClose', dailyCloseSchema);
