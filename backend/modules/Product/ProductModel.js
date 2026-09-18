import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/money.js';

const variantSubSchema = new mongoose.Schema({
  talle: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  cantidad: { type: Number, required: true, min: 0, default: 0 },
  deposito: { type: Number, min: 0, default: 0 },
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
    variants: {
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
  },
  { timestamps: true, toJSON: { getters: true } }
);

productSchema.pre('save', function (next) {
  if (this.variants?.length > 0) {
    this.cantidad = this.variants.reduce((sum, v) => sum + v.cantidad, 0);
  }
  next();
});

productSchema.index({ nombre: 'text' });
productSchema.index({ categoria: 1 });
productSchema.index({ codigo: 1 }, { unique: true, sparse: true });

export default mongoose.model('Product', productSchema);