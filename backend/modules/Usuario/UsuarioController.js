import Usuario from '../Autenticacion/UsuarioModel.js';
import SuscripcionPush from '../Push/PushModel.js';
import {
  crearUsuarioSchema,
  actualizarUsuarioSchema,
  claveUsuarioSchema,
  activoUsuarioSchema,
} from './UsuarioSchema.js';

const sinClave = '-clave -versionToken';

const esMismoUsuario = (req, target) => String(target._id) === String(req.usuario.id);

const ultimoAdminActivo = async (target) => {
  if (target.rol !== 'admin') return false;
  const cantidad = await Usuario.countDocuments({ rol: 'admin', activo: true, _id: { $ne: target._id } });
  return cantidad === 0;
};

export const obtenerUsuarios = async (req, res, next) => {
  try {
    const usuarios = await Usuario.find({}, sinClave).sort({ fechaCreacion: 1 });
    res.json(usuarios);
  } catch (error) {
    next(error);
  }
};

export const crearUsuario = async (req, res, next) => {
  try {
    const data = crearUsuarioSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const existe = await Usuario.exists({ email });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
    }

    const usuario = await Usuario.create({
      nombre: data.nombre,
      email,
      clave: data.clave,
      rol: data.rol,
      activo: data.activo,
    });

    const creado = usuario.toJSON();
    delete creado.versionToken;
    res.status(201).json(creado);
  } catch (error) {
    next(error);
  }
};

export const actualizarUsuario = async (req, res, next) => {
  try {
    const data = actualizarUsuarioSchema.parse(req.body);
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (usuario.rol === 'admin') {
      return res.status(400).json({ message: 'Las cuentas de administrador no se pueden modificar' });
    }

    if (data.rol !== undefined && usuario.rol !== data.rol) {
      if (await ultimoAdminActivo(usuario)) {
        return res.status(400).json({ message: 'No podés quitar el rol admin al último administrador activo' });
      }
      usuario.rol = data.rol;
    }

    if (data.nombre !== undefined) {
      usuario.nombre = data.nombre;
    }
    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      const existe = await Usuario.exists({ email, _id: { $ne: usuario._id } });
      if (existe) {
        return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
      }
      usuario.email = email;
    }

    await usuario.save();
    const actualizado = usuario.toJSON();
    delete actualizado.versionToken;
    res.json(actualizado);
  } catch (error) {
    next(error);
  }
};

export const reiniciarClave = async (req, res, next) => {
  try {
    const { clave } = claveUsuarioSchema.parse(req.body);
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (usuario.rol === 'admin' && !esMismoUsuario(req, usuario)) {
      return res.status(400).json({ message: 'No podés reiniciar la clave de otro administrador' });
    }

    usuario.clave = clave;
    usuario.versionToken = (usuario.versionToken || 0) + 1;
    await usuario.save();

    res.json({ message: 'Contraseña actualizada, el usuario deberá iniciar sesión de nuevo' });
  } catch (error) {
    next(error);
  }
};

export const cambiarActivo = async (req, res, next) => {
  try {
    const { activo } = activoUsuarioSchema.parse(req.body);
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (usuario.rol === 'admin') {
      return res.status(400).json({ message: 'Las cuentas de administrador no se pueden desactivar' });
    }

    if (esMismoUsuario(req, usuario)) {
      return res.status(400).json({ message: 'No podés desactivar tu propia cuenta' });
    }

    if (!activo && (await ultimoAdminActivo(usuario))) {
      return res.status(400).json({ message: 'No podés desactivar al último administrador activo' });
    }

    if (!activo && usuario.activo) {
      usuario.versionToken = (usuario.versionToken || 0) + 1;
    }
    usuario.activo = activo;
    await usuario.save();

    if (!activo) {
      await SuscripcionPush.deleteMany({ usuarioId: usuario._id });
    }

    res.json({ _id: usuario._id, activo: usuario.activo });
  } catch (error) {
    next(error);
  }
};

export const eliminarUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (usuario.rol === 'admin') {
      return res.status(400).json({ message: 'Las cuentas de administrador no se pueden eliminar' });
    }

    if (esMismoUsuario(req, usuario)) {
      return res.status(400).json({ message: 'No podés eliminar tu propia cuenta' });
    }

    if (usuario.activo && (await ultimoAdminActivo(usuario))) {
      return res.status(400).json({ message: 'No podés eliminar al último administrador activo' });
    }

    await SuscripcionPush.deleteMany({ usuarioId: usuario._id });
    await usuario.deleteOne();
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
};