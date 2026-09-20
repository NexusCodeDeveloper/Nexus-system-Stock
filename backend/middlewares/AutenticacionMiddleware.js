import jwt from 'jsonwebtoken';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';

export const proteger = async (req, res, next) => {
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
    const usuario = await Usuario.findById(decoded.id).select('nombre email rol versionToken');
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida, usuario no encontrado' });
    }
    if ((usuario.versionToken || 0) !== (decoded.versionToken || 0)) {
      return res.status(401).json({ message: 'Sesión expirada, vuelva a iniciar sesión' });
    }

    req.usuario = {
      id: usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const admin = (req, res, next) => {
  if (req.usuario && req.usuario.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Acceso denegado, se requiere rol de administrador' });
  }
};
