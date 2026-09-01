import mongoose from 'mongoose';

const cashWithdrawalSchema = new mongoose.Schema(
  {
    monto: {
      type: Number,
      required: true,
      min: 0.01,
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
  { timestamps: true }
);

cashWithdrawalSchema.index({ createdAt: -1 });

export default mongoose.model('CashWithdrawal', cashWithdrawalSchema);