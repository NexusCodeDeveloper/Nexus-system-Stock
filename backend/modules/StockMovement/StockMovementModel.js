import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productoNombre: {
      type: String,
      trim: true,
      default: '',
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
    tipo: {
      type: String,
      enum: ['ingreso_deposito', 'ajuste_deposito', 'reposicion', 'retiro_deposito', 'ajuste_salon'],
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
    },
    empleado: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

stockMovementSchema.index({ createdAt: -1 });

export default mongoose.model('StockMovement', stockMovementSchema);
