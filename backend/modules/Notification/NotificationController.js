import Notification from './NotificationModel.js';
import {
  createNotificationSchema,
  updateNotificationSchema,
  completeNotificationSchema,
} from './NotificationSchema.js';

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
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Aviso no encontrado' });
    }
    if (notification.estado === 'realizado') {
      return res.status(400).json({ message: 'Este aviso ya fue marcado como realizado' });
    }
    notification.estado = 'realizado';
    notification.comentario = data.comentario || '';
    notification.realizadoNombre = data.realizadoNombre;
    notification.realizadoPor = req.user.id;
    notification.realizadoEn = new Date();
    notification.nuevaParaAdmin = req.user.rol === 'admin' ? false : true;
    await notification.save();
    const populated = await populateUsers(
      Notification.findById(notification._id)
    );
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