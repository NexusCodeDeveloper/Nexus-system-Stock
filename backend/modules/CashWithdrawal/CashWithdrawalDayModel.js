import mongoose from 'mongoose';

const cashWithdrawalDaySchema = new mongoose.Schema({
  fecha: {
    type: String,
    required: true,
    unique: true,
  },
  retirado: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model('CashWithdrawalDay', cashWithdrawalDaySchema);