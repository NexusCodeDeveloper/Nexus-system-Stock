import mongoose from 'mongoose';
import { campoCentavos, campoCentavosPositivo } from '../../utils/money.js';

const itemSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  cantidad: { type: Number, required: true, min: 1 },
  precio: { ...campoCentavosPositivo, required: true },
  talle: { type: String, default: '' },
  color: { type: String, default: '' },
  subtotal: { ...campoCentavosPositivo, required: true },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  ticketNumero: { type: String, unique: true, sparse: true, trim: true },
  items: [itemSchema],
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  cantidad: { type: Number, min: 1 },
  precio: campoCentavosPositivo,
  talle: { type: String, default: '' },
  total: { ...campoCentavosPositivo, required: true },
  empleado: { type: String, required: true, trim: true },
  pagos: [{
    metodo: { type: String, enum: ['efectivo', 'transferencia', 'tarjeta'], required: true },
    monto: { ...campoCentavosPositivo, required: true },
  }],
  metodoPago: { type: String, enum: ['efectivo', 'transferencia', 'tarjeta'] },
  descuento: { type: Number, default: 0, min: 0, max: 100 },
  estado: { type: String, enum: ['activa', 'devuelta'], default: 'activa' },
  montoDevuelto: { ...campoCentavosPositivo, default: 0 },
  cantidadDevuelta: { type: Number, default: 0, min: 0 },
  devoluciones: [{
    motivo: { type: String, trim: true, default: '' },
    cantidad: { type: Number, min: 1 },
    monto: campoCentavos,
    fecha: { type: Date, default: Date.now },
  }],
}, { timestamps: true, toJSON: { getters: true } });

saleSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    this.producto = this.items[0].producto;
    this.cantidad = this.items[0].cantidad;
    this.precio = this.items[0].precio;
    this.talle = this.items[0].talle;
  }
  if (this.pagos && this.pagos.length > 0 && !this.metodoPago) {
    this.metodoPago = this.pagos[0].metodo;
  }
  next();
});

saleSchema.index({ 'items.producto': 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ 'pagos.metodo': 1 });
saleSchema.index({ estado: 1 });

export default mongoose.model('Sale', saleSchema);
