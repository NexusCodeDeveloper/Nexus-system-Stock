import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from './AuthModel.js';
import { loginSchema } from './AuthSchema.js';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

export const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(data.password))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = generateToken(user);

    res.json({
      _id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};
