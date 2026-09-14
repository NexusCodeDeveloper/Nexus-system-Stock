import mongoose from 'mongoose';
import { campoCentavos } from '../../utils/money.js';

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
  { timestamps: true, toJSON: { getters: true } }
);

cashWithdrawalSchema.index({ createdAt: -1 });

export default mongoose.model('CashWithdrawal', cashWithdrawalSchema);