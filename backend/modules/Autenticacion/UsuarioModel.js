import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const usuarioSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    clave: {
      type: String,
      required: true,
      minlength: 6,
    },
    rol: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    activo: {
      type: Boolean,
      default: true,
    },
    versionToken: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' } }
);

usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('clave')) return next();
  const salt = await bcrypt.genSalt(12);
  this.clave = await bcrypt.hash(this.clave, salt);
  next();
});

usuarioSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.clave);
};

usuarioSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.clave;
  return obj;
};

export default mongoose.model('Usuario', usuarioSchema, 'usuarios');
