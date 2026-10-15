import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/DineroUtils.js';
import { asegurarCodigosVariante } from '../../utils/CodigosVarianteUtils.js';

const variantSubSchema = new mongoose.Schema({
  talle: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  cantidad: { type: Number, required: true, min: 0, default: 0 },
  deposito: { type: Number, min: 0, default: 0 },
  codigo: { type: String, trim: true, uppercase: true },
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    precio: {
      ...campoCentavosPositivo,
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    deposito: {
      type: Number,
      min: 0,
      default: 0,
    },
    variantes: {
      type: [variantSubSchema],
      default: [],
    },
    colores: {
      type: [String],
      default: [],
    },
    categoria: {
      type: String,
      required: true,
      trim: true,
    },
    proveedor: {
      type: String,
      trim: true,
      default: '',
    },
    codigo: {
      type: String,
      trim: true,
      uppercase: true,
      immutable: true,
    },
    stockMinimo: {
      type: Number,
      default: 2,
      min: 0,
    },
    siguienteSufijoVariante: {
      type: Number,
      default: 1,
      min: 1,
    },
    enPapelera: {
      type: Boolean,
      default: false,
    },
    eliminadoEn: {
      type: Date,
    },
    eliminadoPor: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

productSchema.pre('save', function (next) {
  if (this.variantes?.length > 0) {
    this.cantidad = this.variantes.reduce((sum, v) => sum + v.cantidad, 0);
    asegurarCodigosVariante(this);
  }
  next();
});

productSchema.index({ nombre: 'text' });
productSchema.index({ nombre: 1, _id: 1 });
productSchema.index({ categoria: 1 });
productSchema.index({ enPapelera: 1, nombre: 1 });
productSchema.index({ codigo: 1 }, { unique: true, sparse: true });

export default mongoose.model('Producto', productSchema, 'productos');