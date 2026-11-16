import jwt from 'jsonwebtoken';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';
import Sesion, { INACTIVIDAD_MAX_MS, REFRESCO_MIN_MS } from '../modules/Autenticacion/SesionModel.js';

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
  if (!decoded.id || !decoded.jti) {
    return res.status(401).json({ message: 'No autorizado, token inválido' });
  }

  try {
    const usuario = await Usuario.findById(decoded.id).select('nombre email rol versionToken permisos activo');
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión inválida, usuario no encontrado' });
    }
    if (!usuario.activo) {
      return res.status(401).json({ message: 'Cuenta desactivada, contacte al administrador', codigo: 'CUENTA_DESACTIVADA' });
    }
    if ((usuario.versionToken || 0) !== (decoded.versionToken || 0)) {
      return res.status(401).json({ message: 'Sesión expirada, vuelva a iniciar sesión' });
    }
    const sesion = await Sesion.findOne({ jti: decoded.jti, usuarioId: usuario._id }).select('expiraEn');
    const ahora = Date.now();
    // El TTL de Mongo borra con retraso, por eso se compara el vencimiento a mano
    if (!sesion || sesion.expiraEn.getTime() <= ahora) {
      return res.status(401).json({ message: 'Sesión expirada, vuelva a iniciar sesión' });
    }
    // Actividad: se corre el vencimiento por inactividad (el tope absoluto lo fija el JWT)
    const nuevoVencimiento = ahora + INACTIVIDAD_MAX_MS;
    if (nuevoVencimiento - sesion.expiraEn.getTime() >= REFRESCO_MIN_MS) {
      await Sesion.updateOne({ _id: sesion._id }, { expiraEn: new Date(nuevoVencimiento) });
    }

    req.usuario = {
      jti: decoded.jti,
      id: usuario._id.toString(),
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      permisos: usuario.permisos || [],
      activo: usuario.activo,
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
