import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/DineroUtils.js';

const dailyCloseSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
  },
  turno: { type: String, enum: ['manana', 'tarde', 'dia'], required: true, default: 'dia' },
  estado: { type: String, enum: ['abierto', 'cerrando', 'cerrado'], default: 'cerrado' },
  offset: { type: Number },
  abiertaEn: { type: Date },
  abiertoPor: { type: String, trim: true, default: '' },
  abiertoPorUsuario: { type: String, trim: true, default: '' },
  fondoInicial: { ...campoCentavosPositivo, default: 0 },
  desde: { type: Date },
  hasta: { type: Date },
  total: { ...campoCentavosPositivo, default: 0 },
  cantidad: { type: Number, default: 0 },
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
  cerradoPorUsuario: { type: String, trim: true, default: '' },
  cerradaEn: { type: Date },
  retiros: [{
    monto: { ...campoCentavosPositivo, required: true },
    motivo: { type: String, trim: true, default: '' },
    realizadoPor: { type: String, trim: true, default: '' },
    fecha: { type: Date, default: Date.now },
  }],
  totalRetiros: { ...campoCentavosPositivo, default: 0 },
  totalDevoluciones: { ...campoCentavosPositivo, default: 0 },
  efectivoDevuelto: { ...campoCentavosPositivo, default: 0 },
  efectivoEsperado: campoCentavosPositivo,
  actualizadoEn: { type: Date },
  reaperturas: [{
    por: { type: String, trim: true, default: '' },
    usuario: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  }],
}, { toJSON: { getters: true } });

dailyCloseSchema.index({ fecha: 1, turno: 1 }, { unique: true });

export default mongoose.model('CierreCaja', dailyCloseSchema, 'cierresCaja');
