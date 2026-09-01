import PushSubscription from './PushModel.js';
import { registrarSuscripcion, eliminarSuscripcion } from '../../services/pushService.js';

export const subscribe = async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ message: 'Suscripción inválida' });
    }
    await registrarSuscripcion(subscription, req.user);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const unsubscribe = async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint requerido' });
    }
    await eliminarSuscripcion(endpoint);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export default { subscribe, unsubscribe, PushSubscription };