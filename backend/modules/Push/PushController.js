import { registrarSuscripcion, eliminarSuscripcion } from '../../services/PushService.js';

export const suscribir = async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ message: 'Suscripción inválida' });
    }
    await registrarSuscripcion(subscription, req.usuario);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const desuscribir = async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint requerido' });
    }
    await eliminarSuscripcion(endpoint, req.usuario.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
