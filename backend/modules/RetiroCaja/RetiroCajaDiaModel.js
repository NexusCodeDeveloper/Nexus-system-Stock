import mongoose from 'mongoose';

const cashWithdrawalCounterSchema = new mongoose.Schema({
  caja: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CierreCaja',
    required: true,
    unique: true,
  },
  retirado: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model('RetiroCajaDia', cashWithdrawalCounterSchema, 'retirosCajaContadores');
