import Devolucion from './DevolucionModel.js';
import { schemaCrearDevolucion } from './DevolucionSchema.js';
import { enviarEvento } from '../../services/PushService.js';
import { ejecutarDevolucion, revertirDevolucion } from './DevolucionService.js';
import { responderErrorDeServicio } from '../../utils/RespuestaErrorUtils.js';
import { conReintentos } from '../../utils/TransaccionesUtils.js';

export const crearDevolucion = async (req, res, next) => {
  try {
    const data = schemaCrearDevolucion.parse(req.body);
    const { devolucion } = await conReintentos(() => ejecutarDevolucion(data, req.usuario));

    void enviarEvento({
      tipo: 'devolucion',
      titulo: 'Devolución registrada',
      mensaje: `${devolucion.producto?.nombre || 'Producto'} × ${data.cantidad}${data.venta ? ' · con ticket' : ' · sin ticket'}`,
      url: '/returns',
      para: 'admins',
    });

    res.status(201).json(devolucion);
  } catch (error) {
    responderErrorDeServicio(error, res, next);
  }
};

export const eliminarDevolucion = async (req, res, next) => {
  try {
    await conReintentos(() => revertirDevolucion(req.params.id));
    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    responderErrorDeServicio(error, res, next);
  }
};

export const obtenerDevoluciones = async (req, res, next) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    const returns = await Devolucion.find()
      .populate('producto', 'nombre categoria')
      .populate('productoCargar', 'nombre codigo')
      .populate('venta', 'ticketNumero total empleado')
      .sort({ fechaCreacion: -1 })
      .limit(limite);

    res.json(returns);
  } catch (error) {
    next(error);
  }
};
