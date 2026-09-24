import Notificacion from './NotificacionModel.js';
import Usuario from '../Autenticacion/UsuarioModel.js';
import {
  schemaCrearNotificacion,
  schemaActualizarNotificacion,
  schemaCompletarNotificacion,
} from './NotificacionSchema.js';
import { enviarEvento } from '../../services/PushService.js';

const poblarUsuarios = (query) =>
  query
    .populate('creadoPor', 'nombre')
    .populate('realizadoPor', 'nombre')
    .populate('destinatario', 'nombre');

const resolverDestinatario = async (destinatario) => {
  if (!destinatario) return { destinatario: null, destinatarioNombre: '' };
  const empleado = await Usuario.findOne(
    { _id: destinatario, activo: true, rol: 'user' },
    'nombre'
  );
  if (!empleado) {
    const error = new Error('El empleado seleccionado no existe o no está activo');
    error.statusCode = 400;
    throw error;
  }
  return { destinatario: empleado._id, destinatarioNombre: empleado.nombre };
};

export const obtenerNotificaciones = async (req, res, next) => {
  try {
    const filtro =
      req.usuario.rol === 'admin'
        ? {}
        : { $or: [{ destinatario: null }, { destinatario: req.usuario.id }] };
    const notificaciones = await poblarUsuarios(
      Notificacion.find(filtro).sort({ fechaCreacion: -1 })
    );
    res.json(
      notificaciones.map((n) => {
        const obj = n.toJSON();
        obj.nuevaParaAdmin = Boolean(n.nuevaParaAdmin)
          && !(n.vistosPor || []).some((id) => String(id) === String(req.usuario.id));
        return obj;
      })
    );
  } catch (error) {
    next(error);
  }
};

export const crearNotificacion = async (req, res, next) => {
  try {
    const data = schemaCrearNotificacion.parse(req.body);
    const asignacion = await resolverDestinatario(data.destinatario);
    const notificacion = await Notificacion.create({
      ...data,
      ...asignacion,
      creadoPor: req.usuario.id,
    });

    void enviarEvento({
      tipo: 'aviso',
      titulo: 'Nuevo aviso',
      mensaje: data.titulo,
      url: '/notificaciones',
      para: asignacion.destinatario
        ? { usuarioId: asignacion.destinatario, nombre: asignacion.destinatarioNombre }
        : 'empleados',
    });

    res.status(201).json(notificacion);
  } catch (error) {
    next(error);
  }
};

export const actualizarNotificacion = async (req, res, next) => {
  try {
    const data = schemaActualizarNotificacion.parse(req.body);
    const cambios = { ...data };
    if ('destinatario' in data) {
      Object.assign(cambios, await resolverDestinatario(data.destinatario));
    }
    const notificacion = await Notificacion.findByIdAndUpdate(req.params.id, cambios, {
      new: true,
      runValidators: true,
    });
    if (!notificacion) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    res.json(notificacion);
  } catch (error) {
    next(error);
  }
};

export const eliminarNotificacion = async (req, res, next) => {
  try {
    const notificacion = await Notificacion.findByIdAndDelete(req.params.id);
    if (!notificacion) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    res.json({ message: 'Aviso eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

export const completarNotificacion = async (req, res, next) => {
  try {
    const data = schemaCompletarNotificacion.parse(req.body);
    const esAdmin = req.usuario.rol === 'admin';
    const notificacion = await Notificacion.findOneAndUpdate(
      {
        _id: req.params.id,
        estado: { $ne: 'realizado' },
        ...(esAdmin
          ? {}
          : { $or: [{ destinatario: null }, { destinatario: req.usuario.id }] }),
      },
      {
        $set: {
          estado: 'realizado',
          comentario: data.comentario || '',
          realizadoNombre: req.usuario.nombre,
          realizadoPor: req.usuario.id,
          realizadoEn: new Date(),
          nuevaParaAdmin: esAdmin ? false : true,
          vistosPor: [],
        },
      },
      { new: true }
    );
    if (!notificacion) {
      const existe = await Notificacion.findById(req.params.id);
      if (!existe) {
        return res.status(404).json({ message: 'Aviso no encontrado' });
      }
      if (existe.estado === 'realizado') {
        return res.status(400).json({ message: 'Este aviso ya fue marcado como realizado' });
      }
      return res.status(403).json({ message: 'Este aviso está asignado a otro empleado' });
    }
    const pobladas = await poblarUsuarios(
      Notificacion.findById(notificacion._id)
    );

    void enviarEvento({
      tipo: 'aviso',
      titulo: 'Aviso completado',
      mensaje: `${notificacion.titulo} · ${req.usuario.nombre}`,
      url: '/notificaciones',
      para: 'admins',
    });

    res.json(pobladas);
  } catch (error) {
    next(error);
  }
};

export const reabrirNotificacion = async (req, res, next) => {
  try {
    const notificacion = await Notificacion.findById(req.params.id);
    if (!notificacion) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    notificacion.estado = 'pendiente';
    notificacion.comentario = '';
    notificacion.realizadoNombre = '';
    notificacion.realizadoPor = null;
    notificacion.realizadoEn = null;
    notificacion.nuevaParaAdmin = false;
    notificacion.vistosPor = [];
    await notificacion.save();
    const pobladas = await poblarUsuarios(
      Notificacion.findById(notificacion._id)
    );
    res.json(pobladas);
  } catch (error) {
    next(error);
  }
};

export const marcarVistasAdmin = async (req, res, next) => {
  try {
    await Notificacion.updateMany(
      { nuevaParaAdmin: true, vistosPor: { $ne: req.usuario.id } },
      { $addToSet: { vistosPor: req.usuario.id } }
    );
    res.json({ message: 'Notificaciones marcadas como vistas' });
  } catch (error) {
    next(error);
  }
};
