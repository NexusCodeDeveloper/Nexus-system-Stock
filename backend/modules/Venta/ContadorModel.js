import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String },
  secuencia: { type: Number, default: 0 },
});

export default mongoose.model('Contador', counterSchema, 'contadores');
