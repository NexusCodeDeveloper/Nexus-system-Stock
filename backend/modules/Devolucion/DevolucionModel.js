import mongoose from 'mongoose';
import { campoCentavos, campoCentavosPositivo } from '../../utils/DineroUtils.js';

const returnSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
      min: 1,
    },
    talle: {
      type: String,
      trim: true,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      default: '',
    },
    productoCargar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      default: null,
    },
    cantidadCargar: {
      type: Number,
      default: 0,
    },
    talleCargar: {
      type: String,
      trim: true,
      default: '',
    },
    colorCargar: {
      type: String,
      trim: true,
      default: '',
    },
    venta: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venta',
      default: null,
    },
    diferencia: {
      ...campoCentavos,
      default: 0,
    },
    montoDevuelto: {
      ...campoCentavosPositivo,
      default: 0,
    },
    efectivoDevuelto: {
      ...campoCentavosPositivo,
      default: 0,
    },
    precioUnitario: {
      ...campoCentavosPositivo,
      default: 0,
    },
    descuentoAplicado: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    pagosOriginales: {
      type: [{
        metodo: { type: String, enum: ['efectivo', 'transferencia', 'tarjeta'] },
        monto: campoCentavosPositivo,
      }],
      default: [],
    },
    ventaDiferenciaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venta',
      default: null,
    },
    motivo: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

returnSchema.index({ producto: 1, fechaCreacion: -1 });
returnSchema.index({ productoCargar: 1 });
returnSchema.index({ venta: 1 });
returnSchema.index({ fechaCreacion: -1 });

export default mongoose.model('Devolucion', returnSchema, 'devoluciones');
