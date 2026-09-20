import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Usuario from './UsuarioModel.js';
import { iniciarSesionSchema } from './AutenticacionSchema.js';

const generarToken = (usuario) => {
  return jwt.sign(
    {
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      versionToken: usuario.versionToken || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

export const iniciarSesion = async (req, res, next) => {
  try {
    const data = iniciarSesionSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const usuario = await Usuario.findOne({ email });
    if (!usuario || !(await usuario.comparePassword(data.clave))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = generarToken(usuario);

    res.json({
      _id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const obtenerPerfil = async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-clave');
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};