import jwt from 'jsonwebtoken';
import User from '../modules/Auth/AuthModel.js';

export const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ message: 'No autorizado, no hay token' });
  }

  const token = auth.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'No autorizado, token inválido' });
  }
  if (!decoded.id) {
    return res.status(401).json({ message: 'No autorizado, token inválido' });
  }

  try {
    const user = await User.findById(decoded.id).select('nombre email rol tokenVersion');
    if (!user) {
      return res.status(401).json({ message: 'Sesión inválida, usuario no encontrado' });
    }
    if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Sesión expirada, vuelva a iniciar sesión' });
    }

    req.user = {
      id: user._id.toString(),
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Acceso denegado, se requiere rol de administrador' });
  }
};
