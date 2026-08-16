import mongoose from 'mongoose';

const returnSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
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
      ref: 'Product',
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
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },
    diferencia: {
      type: Number,
      default: 0,
    },
    motivo: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

returnSchema.index({ producto: 1, createdAt: -1 });
returnSchema.index({ productoCargar: 1 });
returnSchema.index({ sale: 1 });
returnSchema.index({ createdAt: -1 });

export default mongoose.model('Return', returnSchema);
