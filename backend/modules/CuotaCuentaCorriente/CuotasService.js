import CuotaCuentaCorriente, { MAX_CUOTAS } from './CuotaCuentaCorrienteModel.js';
import MovimientoCuentaCorriente from '../MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import Notificacion from '../Notificacion/NotificacionModel.js';
import Usuario from '../Autenticacion/UsuarioModel.js';
import { registrarInteresDeFinanciacion } from '../MovimientoCuentaCorriente/CuentaCorrienteService.js';
import { obtenerAjustes } from '../AjustesCuentaCorriente/AjustesCuentaCorrienteService.js';
import { aCentavos, deCentavos, redondearMonto } from '../../utils/DineroUtils.js';
import { fechaHoyCliente } from '../../utils/FechasUtils.js';
import { enviarEvento } from '../../services/PushService.js';

export const MAX_CUOTAS_PLAN = MAX_CUOTAS;

const INTERVALO_REVISION_MS = 60 * 60 * 1000;
let ultimaRevision = 0;
let adminCache = null;

export const hoyEnUtc = () => {
  const { y, m, d } = fechaHoyCliente(0);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Suma meses manteniendo el día; si el mes no lo tiene, usa el último día. */
export const sumarMeses = (fecha, meses) => {
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + meses;
  const dia = fecha.getUTCDate();
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dia, ultimoDia)));
};

export const fechasDeVencimiento = (primerVencimiento, cantidad) =>
  Array.from({ length: cantidad }, (_, i) => sumarMeses(primerVencimiento, i));

const formatearFecha = (fecha) =>
  `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${fecha.getUTCFullYear()}`;

const formatearMonto = (monto) =>
  `$${Number(monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Interés fijo sobre el monto financiado, repartido en cuotas iguales.
 * Todo el cálculo se hace en centavos enteros: la última cuota absorbe el redondeo.
 */
export const calcularPlanCuotas = ({ montoBase, cantidadCuotas, interesPorcentaje, aplicarInteres }) => {
  const baseCentavos = Math.max(aCentavos(montoBase), 0);
  const cuotas = Math.min(Math.max(Math.trunc(Number(cantidadCuotas)) || 1, 1), MAX_CUOTAS);
  const porcentaje = aplicarInteres ? Math.max(Number(interesPorcentaje) || 0, 0) : 0;
  const interesCentavos = Math.max(0, Math.round((baseCentavos * porcentaje) / 100));
  const totalCentavos = baseCentavos + interesCentavos;
  const porCuota = Math.floor(totalCentavos / cuotas);
  const montosCentavos = Array.from({ length: cuotas }, (_, i) =>
    i === cuotas - 1 ? totalCentavos - porCuota * (cuotas - 1) : porCuota
  );
  return { baseCentavos, interesCentavos, totalCentavos, montosCentavos, interesPorcentaje: porcentaje, cantidadCuotas: cuotas };
};

/** Plan que se aplica cuando la venta no lo especifica: 1 cuota a 30 días, sin interés. */
export const planPorDefecto = async () => {
  const ajustes = await obtenerAjustes();
  return {
    cantidadCuotas: 1,
    aplicarInteres: false,
    interesPorcentaje: 0,
    tasaMoraMensual: ajustes.tasaMoraMensualPorcentaje,
    primerVencimiento: sumarMeses(hoyEnUtc(), 1),
  };
};

/** Normaliza y valida el plan que manda el vendedor al vender a cuenta corriente. */
export const resolverPlanDeVenta = async (data = {}, { offset = 0 } = {}) => {
  const ajustes = await obtenerAjustes();
  const cantidadCuotas = Math.min(Math.max(Math.trunc(Number(data?.cantidadCuotas)) || 1, 1), MAX_CUOTAS);
  const { y, m, d } = fechaHoyCliente(offset);
  const hoyStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let primerVencimiento = null;

  if (data?.primerVencimiento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.primerVencimiento))) {
      const error = new Error('La fecha del primer vencimiento es inválida');
      error.statusCode = 400;
      throw error;
    }
    if (String(data.primerVencimiento) < hoyStr) {
      const error = new Error('La fecha del primer vencimiento no puede ser anterior a hoy');
      error.statusCode = 400;
      throw error;
    }
    const [py, pm, pd] = String(data.primerVencimiento).split('-').map(Number);
    primerVencimiento = new Date(Date.UTC(py, pm - 1, pd));
  }

  return {
    cantidadCuotas,
    aplicarInteres: Boolean(data?.aplicarInteres),
    interesPorcentaje: Math.max(Number(data?.interesPorcentaje ?? ajustes.interesFinanciacionPorcentaje) || 0, 0),
    tasaMoraMensual: Math.max(Number(data?.tasaMoraMensual ?? ajustes.tasaMoraMensualPorcentaje) || 0, 0),
    primerVencimiento: primerVencimiento || sumarMeses(hoyEnUtc(), 1),
  };
};

/** Saldo pendiente de la cuota (capital + mora - pagado), en pesos. */
export const saldoPendienteDeCuota = (cuota) =>
  deCentavos(
    Math.max(0, aCentavos(cuota.monto) + aCentavos(cuota.moraAcumulada) - aCentavos(cuota.pagado))
  );

export const esCuotaVencida = (cuota, hoy = hoyEnUtc()) =>
  ['pendiente', 'parcial'].includes(cuota.estado) && cuota.fechaVencimiento < hoy;

const saldoCapitalCentavos = (cuota) => {
  const monto = aCentavos(cuota.monto);
  const pagado = aCentavos(cuota.pagado);
  const mora = aCentavos(cuota.moraAcumulada);
  const capitalPagado = Math.max(0, pagado - Math.min(pagado, mora));
  return Math.max(0, monto - capitalPagado);
};

const obtenerAdminId = async () => {
  if (adminCache) return adminCache;
  const admin = await Usuario.findOne({ rol: 'admin', activo: true }).select('_id');
  adminCache = admin?._id || null;
  return adminCache;
};

const crearAvisoCuota = async (cuota, { titulo, descripcion, session = null }) => {
  const adminId = await obtenerAdminId();
  if (adminId) {
    await Notificacion.create(
      [{
        titulo,
        descripcion,
        estado: 'pendiente',
        creadoPor: adminId,
        destinatario: null,
        nuevaParaAdmin: true,
        soloAdmin: true,
        cuota: cuota._id,
      }],
      { session }
    );
  }
  void enviarEvento({
    tipo: 'cuota',
    titulo,
    mensaje: `${titulo} · ${descripcion}`,
    url: '/clientes',
    para: 'admins',
  });
};

/**
 * Crea el plan de cuotas de una venta cargada a cuenta corriente:
 * genera el debito por interés de financiación (si corresponde), guarda el snapshot
 * del plan en la venta y crea las cuotas con sus vencimientos.
 */
export const crearPlanDeVenta = async (session, { cliente, clienteNombre, venta, montoBase, plan, usuario }) => {
  const calculo = calcularPlanCuotas({
    montoBase,
    cantidadCuotas: plan?.cantidadCuotas,
    interesPorcentaje: plan?.interesPorcentaje,
    aplicarInteres: plan?.aplicarInteres,
  });
  if (calculo.totalCentavos <= 0 || !venta?._id) return { cuotas: [], calculo };

  const primerVencimiento =
    plan?.primerVencimiento instanceof Date && !Number.isNaN(plan.primerVencimiento.getTime())
      ? plan.primerVencimiento
      : sumarMeses(hoyEnUtc(), 1);
  const tasaMora = Math.max(Number(plan?.tasaMoraMensual) || 0, 0);

  if (calculo.interesCentavos > 0) {
    await registrarInteresDeFinanciacion(session, {
      cliente,
      clienteNombre: clienteNombre || cliente?.nombre || '',
      monto: deCentavos(calculo.interesCentavos),
      porcentaje: calculo.interesPorcentaje,
      venta,
      usuario,
    });
  }

  venta.planCuotas = {
    cantidadCuotas: calculo.cantidadCuotas,
    interesPorcentaje: calculo.interesPorcentaje,
    tasaMoraMensual: tasaMora,
    primerVencimiento,
    montoFinanciado: deCentavos(calculo.totalCentavos),
  };
  if (typeof venta.save === 'function') {
    await venta.save({ session });
  }

  const fechas = fechasDeVencimiento(primerVencimiento, calculo.cantidadCuotas);
  const docs = calculo.montosCentavos.map((montoCentavos, i) => ({
    cliente: cliente?._id || cliente,
    clienteNombre: clienteNombre || cliente?.nombre || '',
    venta: venta._id,
    ticketNumero: venta.ticketNumero || '',
    numero: i + 1,
    totalCuotas: calculo.cantidadCuotas,
    monto: deCentavos(montoCentavos),
    interesPorcentaje: calculo.interesPorcentaje,
    tasaMoraMensual: tasaMora,
    fechaVencimiento: fechas[i],
    estado: 'pendiente',
  }));

  const cuotas = await CuotaCuentaCorriente.create(docs, { session, ordered: true });
  return { cuotas, calculo };
};

/**
 * Reimputa todos los pagos activos del cliente a sus cuotas impagas (la más antigua primero).
 * Se ejecuta al crear, editar o anular un pago, y en devoluciones. El saldo del cliente
 * sigue siendo derivado de los movimientos: esto solo organiza las cuotas.
 */
export const recalcularImputacionesCliente = async (session, clienteId) => {
  if (!clienteId) return [];
  const cuotas = await CuotaCuentaCorriente.find({ cliente: clienteId, estado: { $ne: 'cancelada' } })
    .sort({ fechaVencimiento: 1, numero: 1 })
    .session(session);
  if (cuotas.length === 0) return [];

  const creditos = await MovimientoCuentaCorriente.find({
    cliente: clienteId,
    estado: 'activo',
    tipo: 'credito',
    origen: { $in: ['pago', 'devolucion'] },
  })
    .sort({ fecha: 1, fechaCreacion: 1 })
    .session(session);

  const moras = await MovimientoCuentaCorriente.find({
    cliente: clienteId,
    estado: 'activo',
    tipo: 'debito',
    origen: 'mora',
    origenCuota: { $in: cuotas.map((c) => c._id) },
  }).session(session);

  const moraPorCuota = new Map();
  for (const mora of moras) {
    const clave = String(mora.origenCuota);
    moraPorCuota.set(clave, (moraPorCuota.get(clave) || 0) + aCentavos(mora.monto));
  }

  const estados = new Map(
    cuotas.map((cuota) => [
      String(cuota._id),
      { pagado: 0, mora: moraPorCuota.get(String(cuota._id)) || 0 },
    ])
  );

  for (const credito of creditos) {
    let restante = aCentavos(credito.monto);
    for (const cuota of cuotas) {
      if (restante <= 0) break;
      const estado = estados.get(String(cuota._id));
      const saldo = Math.max(0, aCentavos(cuota.monto) + estado.mora - estado.pagado);
      if (saldo <= 0) continue;
      const aplicar = Math.min(restante, saldo);
      estado.pagado += aplicar;
      restante -= aplicar;
    }
  }

  const pagadasAhora = [];
  const imputaciones = [];
  for (const cuota of cuotas) {
    const estado = estados.get(String(cuota._id));
    const saldoCentavos = Math.max(0, aCentavos(cuota.monto) + estado.mora - estado.pagado);
    const nuevoEstado = saldoCentavos <= 0 ? 'pagada' : estado.pagado > 0 ? 'parcial' : 'pendiente';
    if (cuota.estado !== 'pagada' && nuevoEstado === 'pagada') pagadasAhora.push(cuota._id);
    if (aCentavos(cuota.pagado) !== estado.pagado || cuota.estado !== nuevoEstado) {
      cuota.pagado = deCentavos(estado.pagado);
      cuota.estado = nuevoEstado;
      await cuota.save({ session });
    }
    imputaciones.push({
      cuota: cuota._id,
      numero: cuota.numero,
      totalCuotas: cuota.totalCuotas,
      pagado: deCentavos(estado.pagado),
      saldoPendiente: deCentavos(saldoCentavos),
      estado: nuevoEstado,
    });
  }

  if (pagadasAhora.length > 0) {
    await Notificacion.updateMany(
      { cuota: { $in: pagadasAhora }, estado: 'pendiente' },
      {
        $set: {
          estado: 'realizado',
          realizadoNombre: 'Sistema',
          realizadoEn: new Date(),
          comentario: 'Cuota pagada',
        },
      },
      { session }
    );
  }

  return imputaciones;
};

/**
 * Cancela las cuotas impagas de una venta devuelta por completo.
 * Devuelve cuánto suman los cargos de interés/mora activos para que el llamador
 * emita el crédito que los revierta.
 */
export const cancelarCuotasDeVenta = async (session, venta, usuario, motivo = 'Venta devuelta') => {
  if (!venta?._id) return { canceladas: 0, cargosPendientes: 0 };
  const cuotas = await CuotaCuentaCorriente.find({
    venta: venta._id,
    estado: { $nin: ['pagada', 'cancelada'] },
  }).session(session);
  if (cuotas.length === 0) return { canceladas: 0, cargosPendientes: 0 };

  const ids = cuotas.map((c) => c._id);
  const cargos = await MovimientoCuentaCorriente.find({
    origenVenta: venta._id,
    estado: 'activo',
    tipo: 'debito',
    origen: { $in: ['interes', 'mora'] },
  }).session(session);
  const cargosPendientes = redondearMonto(cargos.reduce((s, m) => s + (Number(m.monto) || 0), 0));

  await CuotaCuentaCorriente.updateMany(
    { _id: { $in: ids } },
    { $set: { estado: 'cancelada', canceladaPor: usuario?.nombre || '', motivoCancelacion: motivo } },
    { session }
  );
  await Notificacion.updateMany(
    { cuota: { $in: ids }, estado: 'pendiente' },
    {
      $set: {
        estado: 'realizado',
        realizadoNombre: 'Sistema',
        realizadoEn: new Date(),
        comentario: motivo,
      },
    },
    { session }
  );

  return { canceladas: cuotas.length, cargosPendientes };
};

/** Anula los cargos de interés/mora de una venta eliminada: ya no corresponden. */
export const anularCargosDeVenta = async (session, ventaId, usuario, motivo = 'Venta eliminada') => {
  if (!ventaId) return 0;
  const resultado = await MovimientoCuentaCorriente.updateMany(
    { origenVenta: ventaId, estado: 'activo', origen: { $in: ['interes', 'mora'] } },
    {
      $set: {
        estado: 'anulado',
        anuladoPor: usuario?.nombre || '',
        anuladoEn: new Date(),
        motivoAnulacion: motivo,
      },
    },
    { session }
  );
  return resultado.modifiedCount || 0;
};

/** Al revertir una devolución total, las cuotas canceladas vuelven a estar pendientes. */
export const reactivarCuotasDeVenta = async (session, ventaId) => {
  if (!ventaId) return 0;
  const resultado = await CuotaCuentaCorriente.updateMany(
    { venta: ventaId, estado: 'cancelada' },
    { $set: { estado: 'pendiente', canceladaPor: '', motivoCancelacion: '' } },
    { session }
  );
  return resultado.modifiedCount || 0;
};

/**
 * Revisa cuotas: avisa las que están por vencer, las vencidas y aplica la mora mensual.
 * Es idempotente: cada aviso y cada mes de mora se registran una sola vez.
 */
export const revisarCuotas = async ({ session = null } = {}) => {
  const ajustes = await obtenerAjustes();
  const hoy = hoyEnUtc();
  const dias = Math.max(Number(ajustes.diasAvisoVencimiento) || 0, 0);
  const limite = new Date(hoy.getTime() + dias * 86400000);
  const resultado = { avisosProximos: 0, avisosVencidos: 0, morasAplicadas: 0, montoMora: 0 };

  const porVencer = await CuotaCuentaCorriente.find({
    estado: { $in: ['pendiente', 'parcial'] },
    avisoPrevioEn: null,
    fechaVencimiento: { $gte: hoy, $lte: limite },
  }).session(session);
  for (const cuota of porVencer) {
    const marcada = await CuotaCuentaCorriente.findOneAndUpdate(
      { _id: cuota._id, avisoPrevioEn: null },
      { $set: { avisoPrevioEn: new Date() } },
      { new: true, session }
    );
    if (!marcada) continue;
    await crearAvisoCuota(cuota, {
      titulo: 'Cuota por vencer',
      descripcion: `${cuota.clienteNombre} · cuota ${cuota.numero}/${cuota.totalCuotas} de ${cuota.ticketNumero || 'ticket'} vence el ${formatearFecha(cuota.fechaVencimiento)}`,
      session,
    });
    resultado.avisosProximos += 1;
  }

  const vencidas = await CuotaCuentaCorriente.find({
    estado: { $in: ['pendiente', 'parcial'] },
    avisoVencimientoEn: null,
    fechaVencimiento: { $lt: hoy },
  }).session(session);
  for (const cuota of vencidas) {
    const marcada = await CuotaCuentaCorriente.findOneAndUpdate(
      { _id: cuota._id, avisoVencimientoEn: null },
      { $set: { avisoVencimientoEn: new Date() } },
      { new: true, session }
    );
    if (!marcada) continue;
    await crearAvisoCuota(cuota, {
      titulo: 'Cuota vencida',
      descripcion: `${cuota.clienteNombre} · cuota ${cuota.numero}/${cuota.totalCuotas} de ${cuota.ticketNumero || 'ticket'} venció el ${formatearFecha(cuota.fechaVencimiento)} y sigue impaga`,
      session,
    });
    resultado.avisosVencidos += 1;
  }

  const impagas = await CuotaCuentaCorriente.find({
    estado: { $in: ['pendiente', 'parcial'] },
    tasaMoraMensual: { $gt: 0 },
    fechaVencimiento: { $lt: hoy },
  }).session(session);

  for (const cuota of impagas) {
    while (true) {
      let cobertura;
      if (!cuota.moraAplicadaHasta) {
        // Primer incremento: apenas la cuota queda vencida.
        if (cuota.fechaVencimiento >= hoy) break;
        cobertura = sumarMeses(cuota.fechaVencimiento, 1);
      } else {
        // Un mes más de mora por cada mes que siga impaga.
        if (cuota.moraAplicadaHasta > hoy) break;
        cobertura = sumarMeses(cuota.moraAplicadaHasta, 1);
      }

      const capitalPendiente = saldoCapitalCentavos(cuota);
      const moraCentavos = capitalPendiente > 0
        ? Math.round((capitalPendiente * cuota.tasaMoraMensual) / 100)
        : 0;

      const marcada = await CuotaCuentaCorriente.findOneAndUpdate(
        {
          _id: cuota._id,
          moraAplicadaHasta: cuota.moraAplicadaHasta,
          estado: { $in: ['pendiente', 'parcial'] },
        },
        { $set: { moraAplicadaHasta: cobertura } },
        { new: true, session }
      );
      if (!marcada) break;

      if (moraCentavos > 0) {
        marcada.moraAcumulada = redondearMonto(Number(marcada.moraAcumulada || 0) + deCentavos(moraCentavos));
        await marcada.save({ session });

        await MovimientoCuentaCorriente.create(
          [{
            cliente: marcada.cliente,
            clienteNombre: marcada.clienteNombre,
            tipo: 'debito',
            origen: 'mora',
            monto: deCentavos(moraCentavos),
            formaPago: 'ninguno',
            fecha: cobertura,
            referencia: marcada.ticketNumero,
            nota: `Mora cuota ${marcada.numero}/${marcada.totalCuotas} (${marcada.tasaMoraMensual}% mensual)`,
            estado: 'activo',
            origenVenta: marcada.venta,
            origenCuota: marcada._id,
            registradoPor: 'Sistema',
          }],
          { session }
        );

        resultado.morasAplicadas += 1;
        resultado.montoMora = redondearMonto(resultado.montoMora + deCentavos(moraCentavos));

        await crearAvisoCuota(marcada, {
          titulo: 'Cuota vencida: mora aplicada',
          descripcion: `${marcada.clienteNombre} · cuota ${marcada.numero}/${marcada.totalCuotas} de ${marcada.ticketNumero || 'ticket'}: se sumó ${formatearMonto(deCentavos(moraCentavos))} de mora`,
          session,
        });
      }

      cuota.moraAplicadaHasta = marcada.moraAplicadaHasta;
      cuota.moraAcumulada = marcada.moraAcumulada;
    }
  }

  return resultado;
};

/**
 * Revisión perezosa: se dispara al consultar avisos (el frontend hace poll cada 30 s)
 * y como máximo una vez por hora, para no depender de un cron (Vercel serverless).
 */
export const revisarCuotasSiCorresponde = async () => {
  const ahora = Date.now();
  if (ahora - ultimaRevision < INTERVALO_REVISION_MS) return null;
  ultimaRevision = ahora;
  return revisarCuotas();
};
