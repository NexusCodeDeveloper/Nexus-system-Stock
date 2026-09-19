import mongoose from 'mongoose';
import { campoCentavos } from '../../utils/DineroUtils.js';

const cashWithdrawalSchema = new mongoose.Schema(
  {
    monto: {
      ...campoCentavos,
      required: true,
      min: 1,
    },
    motivo: {
      type: String,
      required: true,
      trim: true,
    },
    realizadoPor: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

cashWithdrawalSchema.index({ fechaCreacion: -1 });

export default mongoose.model('RetiroCaja', cashWithdrawalSchema, 'retirosCaja');