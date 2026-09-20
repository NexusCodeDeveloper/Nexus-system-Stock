import Notificacion from './NotificacionModel.js';
import {
  schemaCrearNotificacion,
  schemaActualizarNotificacion,
  schemaCompletarNotificacion,
} from './NotificacionSchema.js';
import { enviarEvento } from '../../services/PushService.js';

const poblarUsuarios = (query) =>
  query
    .populate('creadoPor', 'nombre')
    .populate('realizadoPor', 'nombre');

export const obtenerNotificaciones = async (req, res, next) => {
  try {
    const notificaciones = await poblarUsuarios(
      Notificacion.find().sort({ fechaCreacion: -1 })
    );
    res.json(notificaciones);
  } catch (error) {
    next(error);
  }
};

export const crearNotificacion = async (req, res, next) => {
  try {
    const data = schemaCrearNotificacion.parse(req.body);
    const notificacion = await Notificacion.create({
      ...data,
      creadoPor: req.usuario.id,
    });

    void enviarEvento({
      tipo: 'aviso',
      titulo: 'Nuevo aviso',
      mensaje: data.titulo,
      url: '/notificaciones',
      para: 'empleados',
    });

    res.status(201).json(notificacion);
  } catch (error) {
    next(error);
  }
};

export const actualizarNotificacion = async (req, res, next) => {
  try {
    const data = schemaActualizarNotificacion.parse(req.body);
    const notificacion = await Notificacion.findByIdAndUpdate(req.params.id, data, {
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
    const notificacion = await Notificacion.findOneAndUpdate(
      { _id: req.params.id, estado: { $ne: 'realizado' } },
      {
        $set: {
          estado: 'realizado',
          comentario: data.comentario || '',
          realizadoNombre: req.usuario.nombre,
          realizadoPor: req.usuario.id,
          realizadoEn: new Date(),
          nuevaParaAdmin: req.usuario.rol === 'admin' ? false : true,
        },
      },
      { new: true }
    );
    if (!notificacion) {
      const existe = await Notificacion.exists({ _id: req.params.id });
      if (!existe) {
        return res.status(404).json({ message: 'Aviso no encontrado' });
      }
      return res.status(400).json({ message: 'Este aviso ya fue marcado como realizado' });
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
      { nuevaParaAdmin: true },
      { $set: { nuevaParaAdmin: false } }
    );
    res.json({ message: 'Notificaciones marcadas como vistas' });
  } catch (error) {
    next(error);
  }
};
