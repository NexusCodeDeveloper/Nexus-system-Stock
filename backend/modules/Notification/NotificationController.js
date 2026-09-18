import Notification from './NotificationModel.js';
import {
  createNotificationSchema,
  updateNotificationSchema,
  completeNotificationSchema,
} from './NotificationSchema.js';
import { enviarEvento } from '../../services/pushService.js';

const populateUsers = (query) =>
  query
    .populate('creadoPor', 'nombre')
    .populate('realizadoPor', 'nombre');

export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await populateUsers(
      Notification.find().sort({ createdAt: -1 })
    );
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req, res, next) => {
  try {
    const data = createNotificationSchema.parse(req.body);
    const notification = await Notification.create({
      ...data,
      creadoPor: req.user.id,
    });

    void enviarEvento({
      tipo: 'aviso',
      titulo: 'Nuevo aviso',
      mensaje: data.titulo,
      url: '/notifications',
      para: 'empleados',
    });

    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
};

export const updateNotification = async (req, res, next) => {
  try {
    const data = updateNotificationSchema.parse(req.body);
    const notification = await Notification.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!notification) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    res.json(notification);
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    res.json({ message: 'Aviso eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

export const completeNotification = async (req, res, next) => {
  try {
    const data = completeNotificationSchema.parse(req.body);
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, estado: { $ne: 'realizado' } },
      {
        $set: {
          estado: 'realizado',
          comentario: data.comentario || '',
          realizadoNombre: req.user.nombre,
          realizadoPor: req.user.id,
          realizadoEn: new Date(),
          nuevaParaAdmin: req.user.rol === 'admin' ? false : true,
        },
      },
      { new: true }
    );
    if (!notification) {
      const existe = await Notification.exists({ _id: req.params.id });
      if (!existe) {
        return res.status(404).json({ message: 'Aviso no encontrado' });
      }
      return res.status(400).json({ message: 'Este aviso ya fue marcado como realizado' });
    }
    const populated = await populateUsers(
      Notification.findById(notification._id)
    );

    void enviarEvento({
      tipo: 'aviso',
      titulo: 'Aviso completado',
      mensaje: `${notification.titulo} · ${req.user.nombre}`,
      url: '/notifications',
      para: 'admins',
    });

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

export const reopenNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    notification.estado = 'pendiente';
    notification.comentario = '';
    notification.realizadoNombre = '';
    notification.realizadoPor = null;
    notification.realizadoEn = null;
    notification.nuevaParaAdmin = false;
    await notification.save();
    const populated = await populateUsers(
      Notification.findById(notification._id)
    );
    res.json(populated);
  } catch (error) {
    next(error);
  }
};

export const markVistasAdmin = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { nuevaParaAdmin: true },
      { $set: { nuevaParaAdmin: false } }
    );
    res.json({ message: 'Notificaciones marcadas como vistas' });
  } catch (error) {
    next(error);
  }
};
