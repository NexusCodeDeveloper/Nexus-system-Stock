import Devolucion from './DevolucionModel.js';
import { schemaCrearDevolucion } from './DevolucionSchema.js';
import { enviarEvento } from '../../services/PushService.js';
import { ejecutarDevolucion, revertirDevolucion } from './DevolucionService.js';
import { responderErrorDeServicio } from '../../utils/RespuestaErrorUtils.js';
import { conReintentos } from '../../utils/TransaccionesUtils.js';
import { RUTAS, formatearMonto, nombreConVariante } from '../../utils/NotificacionesUtils.js';

export const crearDevolucion = async (req, res, next) => {
  try {
    const data = schemaCrearDevolucion.parse(req.body);
    const { devolucion } = await conReintentos(() => ejecutarDevolucion(data, req.usuario));

    const nombre = nombreConVariante(
      devolucion.producto?.nombre || devolucion.productoNombre || 'Producto',
      data.talle,
      data.color
    );
    const autor = req.usuario?.nombre?.trim() || 'Se';
    const partes = [
      `${autor} registró una devolución`,
      `${nombre} × ${data.cantidad}`,
      formatearMonto(devolucion.montoDevuelto),
      `"${data.motivo}"`,
      devolucion.venta?.ticketNumero ? `Ticket ${devolucion.venta.ticketNumero}` : 'Sin ticket',
    ];

    void enviarEvento({
      tipo: 'devolucion',
      titulo: `${req.usuario?.nombre?.trim() || 'Alguien'} registró una devolución`,
      mensaje: partes.join(' · '),
      url: RUTAS.DEVOLUCIONES,
      para: 'admins',
    });

    res.status(201).json(devolucion);
  } catch (error) {
    responderErrorDeServicio(error, res, next);
  }
};

export const eliminarDevolucion = async (req, res, next) => {
  try {
    await conReintentos(() => revertirDevolucion(req.params.id, req.usuario));
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
