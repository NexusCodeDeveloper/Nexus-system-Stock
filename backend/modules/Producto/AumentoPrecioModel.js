import mongoose from 'mongoose';
import { campoCentavos } from '../../utils/DineroUtils.js';
import { TIPOS_AUMENTO_PRECIO } from '../../utils/PreciosUtils.js';

const itemSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  nombre: { type: String, trim: true, default: '' },
  precioAnterior: { ...campoCentavos, required: true },
  precioNuevo: { ...campoCentavos, required: true },
}, { _id: false });

const aumentoPrecioSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: TIPOS_AUMENTO_PRECIO,
      required: true,
    },
    /** Porcentaje (1-10000) o monto fijo en pesos, según el tipo. */
    valor: {
      type: Number,
      required: true,
      min: 0,
    },
    cantidad: {
      type: Number,
      required: true,
      min: 0,
    },
    items: {
      type: [itemSchema],
      default: [],
    },
    creadoPor: {
      type: String,
      trim: true,
      default: '',
    },
    /** Se guarda el estado deshecho para no restaurar dos veces la misma operación. */
    deshecho: {
      type: Boolean,
      default: false,
    },
    deshechoPor: {
      type: String,
      trim: true,
      default: '',
    },
    deshechoEn: {
      type: Date,
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

aumentoPrecioSchema.index({ fechaCreacion: -1 });

export default mongoose.model('AumentoPrecio', aumentoPrecioSchema, 'aumentosPrecio');
