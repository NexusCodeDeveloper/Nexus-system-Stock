import { useState, useEffect, useCallback } from 'react';
import {
  obtenerMovimientosCuenta,
  crearMovimientoCuenta,
  actualizarMovimientoCuenta,
  anularMovimientoCuenta,
  obtenerSaldoCliente,
} from '../../api/clientes';
import { useIosAlert } from '../../components/alerts';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { useApi } from '../../hooks/useApi';
import { useAutenticacion } from '../../context/autenticacionContexto';
import {
  obtenerCuotasCliente,
  obtenerAjustesCuenta,
  actualizarAjustesCuenta,
} from '../../api/cuotas';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import { IosField, IosInput, IosSelect, IosTextArea } from '../../components/ui/IosForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { IconPencil, IconX, IconSettings, IconPrint, IconCash } from '../../components/ui/icons';
import { formatMoney } from '../../utils/format';
import { printEstadoCuenta } from '../../utils/printEstadoCuenta';
import {
  DIAS_AVISO,
  FINANCIACION,
  hayErrores,
  LIMITES,
  validarEntero,
  validarFecha,
  validarMonto,
  validarNumero,
  validarRangoFechas,
  validarTexto,
} from '../../utils/validacion';

const ORIGENES = [
  { key: 'factura', label: 'Factura' },
  { key: 'pago', label: 'Pago' },
  { key: 'ajuste', label: 'Ajuste' },
  { key: 'devolucion', label: 'Devolución' },
  { key: 'venta', label: 'Venta' },
  { key: 'interes', label: 'Interés financiación' },
  { key: 'mora', label: 'Mora' },
];

const FORMAS_PAGO = [
  { key: 'ninguno', label: 'Sin forma de pago' },
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta', label: 'Tarjeta' },
];

const FORMAS_COBRO = FORMAS_PAGO.filter((f) => f.key !== 'ninguno');

const origenLabel = (key) => ORIGENES.find((o) => o.key === key)?.label || key;
const formaPagoLabel = (key) => FORMAS_PAGO.find((f) => f.key === key)?.label || key;

/** Interés y mora los genera el sistema: no se cargan ni se editan a mano. */
const ORIGENES_SISTEMA = ['interes', 'mora'];
const esMovimientoDeSistema = (movimiento) => ORIGENES_SISTEMA.includes(movimiento?.origen);

/** Solo los pagos se pueden editar desde el panel: la deuda nace de las ventas. */
const esPago = (movimiento) => movimiento?.tipo === 'credito' && movimiento?.origen === 'pago';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La fecha del movimiento es de calendario y viaja en UTC: se muestra tal cual se guardó. */
const formatFechaMovimiento = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

/** Formulario de pago: no se elige tipo ni origen, siempre es un crédito por pago. */
const formularioVacio = () => ({
  monto: '',
  formaPago: 'efectivo',
  fecha: hoyLocal(),
  referencia: '',
  nota: '',
});

const ESTADOS_CUOTA = {
  pendiente: { label: 'Pendiente', cls: 'text-ios-secondary bg-ios-surface3' },
  parcial: { label: 'Parcial', cls: 'text-ios-orange bg-ios-orange/10' },
  pagada: { label: 'Pagada', cls: 'text-ios-green bg-ios-green/10' },
  cancelada: { label: 'Cancelada', cls: 'text-ios-tertiary bg-ios-surface3' },
};

const estadoCuotaInfo = (cuota) => {
  if (cuota.estado === 'pagada' || cuota.estado === 'cancelada') return ESTADOS_CUOTA[cuota.estado];
  if (cuota.vencida) return { label: 'Vencida', cls: 'text-ios-red bg-ios-red/10' };
  return ESTADOS_CUOTA[cuota.estado] || ESTADOS_CUOTA.pendiente;
};

const ClienteDetalle = ({ cliente, open, onClose, onCambio }) => {
  const { show: alert, confirm, toast } = useIosAlert();
  const { esAdmin } = useAutenticacion();
  const [saldo, setSaldo] = useState({ totalDebitos: 0, totalCreditos: 0, saldo: 0 });
  const [cuotas, setCuotas] = useState([]);
  const [filtros, setFiltros] = useState({ tipo: '', origen: '', desde: '', hasta: '', buscar: '' });
  const [buscarDebounced, setBuscarDebounced] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formularioVacio());
  const [errores, setErrores] = useState({});
  const [saving, setSaving] = useState(false);
  const [anulando, setAnulando] = useState(null);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');
  const [anulandoSaving, setAnulandoSaving] = useState(false);
  const [showAjustes, setShowAjustes] = useState(false);
  const [ajustes, setAjustes] = useState({
    interesFinanciacionPorcentaje: '',
    tasaMoraMensualPorcentaje: '',
    diasAvisoVencimiento: '',
  });
  const [erroresAjustes, setErroresAjustes] = useState({});
  const [ajustesSaving, setAjustesSaving] = useState(false);
  const [showFormato, setShowFormato] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const clienteId = cliente?._id;
  const errorFiltros = validarRangoFechas(filtros.desde, filtros.hasta);

  const movimientosApi = useApi(
    async () => {
      if (!clienteId) return [];
      const params = { limit: 200 };
      if (filtros.tipo) params.tipo = filtros.tipo;
      if (filtros.origen) params.origen = filtros.origen;
      if (filtros.desde) params.desde = filtros.desde;
      if (filtros.hasta) params.hasta = filtros.hasta;
      if (buscarDebounced) params.buscar = buscarDebounced;
      const res = await obtenerMovimientosCuenta(clienteId, params);
      return Array.isArray(res.data) ? res.data : [];
    },
    { auto: false, mensajeError: 'Error al cargar movimientos' }
  );
  const { run: cargarMovimientos, loading, error } = movimientosApi;
  const movimientos = movimientosApi.data || [];

  useEffect(() => {
    const timer = setTimeout(() => setBuscarDebounced(filtros.buscar.trim()), 300);
    return () => clearTimeout(timer);
  }, [filtros.buscar]);

  const cargarSaldo = useCallback(async () => {
    if (!clienteId) return;
    try {
      const res = await obtenerSaldoCliente(clienteId);
      setSaldo({
        totalDebitos: Number(res.data?.totalDebitos) || 0,
        totalCreditos: Number(res.data?.totalCreditos) || 0,
        saldo: Number(res.data?.saldo) || 0,
      });
    } catch {
      /* el saldo se reintenta en la próxima acción */
    }
  }, [clienteId]);

  const cargarCuotas = useCallback(async () => {
    if (!clienteId) return;
    try {
      const res = await obtenerCuotasCliente(clienteId);
      setCuotas(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* las cuotas se reintentan en la próxima acción */
    }
  }, [clienteId]);

  useEffect(() => {
    if (!open || !clienteId) return;
    setFiltros({ tipo: '', origen: '', desde: '', hasta: '', buscar: '' });
    setBuscarDebounced('');
    setShowForm(false);
    setEditando(null);
    setCuotas([]);
    setSaldo({
      totalDebitos: Number(cliente?.totalDebitos) || 0,
      totalCreditos: Number(cliente?.totalCreditos) || 0,
      saldo: Number(cliente?.saldo) || 0,
    });
    cargarSaldo();
    cargarCuotas();
  }, [open, clienteId, cargarSaldo, cargarCuotas, cliente?.totalDebitos, cliente?.totalCreditos, cliente?.saldo]);

  useEffect(() => {
    if (open && clienteId && !errorFiltros) cargarMovimientos();
  }, [open, clienteId, filtros.tipo, filtros.origen, filtros.desde, filtros.hasta, buscarDebounced, cargarMovimientos, errorFiltros]);

  const resetForm = () => {
    setForm(formularioVacio());
    setErrores({});
    setEditando(null);
    setShowForm(false);
  };

  const refrescar = () => {
    cargarMovimientos();
    cargarSaldo();
    cargarCuotas();
    onCambio?.();
  };

  /** Refresca saldo y cuotas y devuelve el estado nuevo, para avisar cómo quedó el cliente. */
  const refrescarConEstado = async () => {
    cargarMovimientos();
    onCambio?.();
    try {
      const [resSaldo, resCuotas] = await Promise.all([
        obtenerSaldoCliente(clienteId),
        obtenerCuotasCliente(clienteId),
      ]);
      const saldoNuevo = Number(resSaldo.data?.saldo) || 0;
      const cuotasNuevas = Array.isArray(resCuotas.data) ? resCuotas.data : [];
      setSaldo({
        totalDebitos: Number(resSaldo.data?.totalDebitos) || 0,
        totalCreditos: Number(resSaldo.data?.totalCreditos) || 0,
        saldo: saldoNuevo,
      });
      setCuotas(cuotasNuevas);
      return { saldoNuevo, vencidasNuevas: cuotasNuevas.filter((c) => c.vencida).length };
    } catch {
      return { saldoNuevo: null, vencidasNuevas: 0 };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = {
      monto: validarMonto(form.monto),
      fecha: validarFecha(form.fecha, { max: hoyLocal() }),
      referencia: validarTexto(form.referencia, LIMITES.referencia, 'La referencia'),
      nota: validarTexto(form.nota, LIMITES.nota, 'La nota'),
    };
    setErrores(errs);
    if (hayErrores(errs)) return;
    const montoNum = Number(form.monto);
    const saldoActual = Number(saldo.saldo) || 0;
    const deudaDisponible = saldoActual + (editando ? Number(editando.monto) || 0 : 0);
    if (deudaDisponible <= 0) {
      alert({ icon: 'info', title: 'Sin deuda', message: 'El cliente está libre de deuda: no hay nada para cobrar' });
      return;
    }
    if (montoNum > deudaDisponible + 0.001) {
      alert({
        icon: 'warning',
        title: 'Monto mayor a la deuda',
        message: `El pago no puede superar la deuda pendiente (${formatMoney(deudaDisponible)})`,
      });
      return;
    }
    if (editando) {
      const ok = await confirm({
        icon: 'warning',
        title: '¿Guardar cambios del pago?',
        message: `Se va a sobrescribir el pago de ${formatMoney(Number(editando.monto) || 0)} registrado el ${formatFechaMovimiento(editando.fecha)}.`,
        confirmText: 'Guardar',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const payload = {
        tipo: 'credito',
        origen: 'pago',
        monto: montoNum,
        formaPago: form.formaPago,
        fecha: form.fecha || undefined,
        referencia: form.referencia.trim(),
        nota: form.nota.trim(),
      };
      let imputaciones = [];
      if (editando) {
        const res = await actualizarMovimientoCuenta(clienteId, editando._id, payload);
        imputaciones = res.data?.imputaciones || [];
      } else {
        const res = await crearMovimientoCuenta(clienteId, payload);
        imputaciones = res.data?.imputaciones || [];
      }

      const imputadas = imputaciones.filter((i) => Number(i.pagado) > 0);
      const detalleCuotas = imputadas.length > 0
        ? `${imputadas.length === 1 ? 'la cuota' : 'las cuotas'} ${imputadas.map((i) => `${i.numero}/${i.totalCuotas}`).join(', ')}`
        : '';

      const { saldoNuevo, vencidasNuevas } = await refrescarConEstado();

      if (saldoNuevo !== null && saldoNuevo <= 0) {
        alert({ icon: 'success', title: 'Libre de deuda', message: 'El cliente quedó libre de deuda.' });
      } else if (saldoNuevo !== null && vencidasNuevas === 0) {
        alert({
          icon: 'success',
          title: 'Cuotas atrasadas saldadas',
          message: `Se saldaron las cuotas atrasadas. Queda un saldo pendiente de ${formatMoney(saldoNuevo)}.`,
        });
      } else if (saldoNuevo !== null && vencidasNuevas > 0) {
        toast({
          message: `${detalleCuotas ? `Pago imputado a ${detalleCuotas}. ` : 'Pago registrado. '}Aún quedan ${vencidasNuevas} cuota${vencidasNuevas === 1 ? '' : 's'} vencida${vencidasNuevas === 1 ? '' : 's'}.`,
        });
      } else {
        toast({ message: detalleCuotas ? `Pago imputado a ${detalleCuotas}` : editando ? 'Pago actualizado' : 'Pago registrado' });
      }

      resetForm();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al registrar el pago') });
    } finally {
      setSaving(false);
    }
  };

  const handleEditar = (movimiento) => {
    if (!esPago(movimiento)) return;
    setEditando(movimiento);
    setForm({
      monto: String(movimiento.monto),
      formaPago: movimiento.formaPago && movimiento.formaPago !== 'ninguno' ? movimiento.formaPago : 'efectivo',
      fecha: String(movimiento.fecha || '').slice(0, 10),
      referencia: movimiento.referencia || '',
      nota: movimiento.nota || '',
    });
    setErrores({});
    setShowForm(true);
  };

  const handleAnular = async () => {
    if (anulandoSaving) return;
    const motivo = motivoAnular.trim();
    const err = validarTexto(motivo, LIMITES.motivo, 'El motivo');
    if (err) {
      setErrorMotivo(err);
      return;
    }
    setErrorMotivo('');
    setAnulandoSaving(true);
    try {
      await anularMovimientoCuenta(clienteId, anulando._id, motivo);
      setAnulando(null);
      setMotivoAnular('');
      setErrorMotivo('');
      toast({ message: 'Movimiento anulado' });
      refrescar();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al anular movimiento') });
    } finally {
      setAnulandoSaving(false);
    }
  };

  const pedirAnular = async (movimiento) => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Anular este movimiento?',
      message: 'No se borra: queda registrado como anulado y deja de contar para el saldo.',
      confirmText: 'Anular',
      destructive: true,
    });
    if (ok) {
      setAnulando(movimiento);
      setMotivoAnular('');
      setErrorMotivo('');
    }
  };

  const abrirFormulario = () => {
    setForm(formularioVacio());
    setErrores({});
    setEditando(null);
    setShowForm(true);
  };

  const imprimirEstado = async (formato) => {
    if (imprimiendo || !clienteId) return;
    setImprimiendo(true);
    try {
      const [resMovimientos, resCuotas, resSaldo] = await Promise.all([
        obtenerMovimientosCuenta(clienteId, { limit: 500 }),
        obtenerCuotasCliente(clienteId),
        obtenerSaldoCliente(clienteId),
      ]);
      const ok = await printEstadoCuenta({
        cliente,
        movimientos: Array.isArray(resMovimientos.data) ? resMovimientos.data : [],
        cuotas: Array.isArray(resCuotas.data) ? resCuotas.data : [],
        saldo: resSaldo.data || saldo,
        formato,
      });
      if (ok) {
        setShowFormato(false);
      } else {
        toast({ message: 'Habilitá las ventanas emergentes para imprimir' });
      }
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo imprimir el estado de cuenta') });
    } finally {
      setImprimiendo(false);
    }
  };

  const abrirAjustes = async () => {
    try {
      const res = await obtenerAjustesCuenta();
      setAjustes({
        interesFinanciacionPorcentaje: String(res.data?.interesFinanciacionPorcentaje ?? ''),
        tasaMoraMensualPorcentaje: String(res.data?.tasaMoraMensualPorcentaje ?? ''),
        diasAvisoVencimiento: String(res.data?.diasAvisoVencimiento ?? ''),
      });
      setErroresAjustes({});
      setShowAjustes(true);
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudieron cargar los ajustes') });
    }
  };

  const guardarAjustes = async () => {
    if (ajustesSaving) return;
    const errs = {
      interes: validarNumero(ajustes.interesFinanciacionPorcentaje, {
        ...FINANCIACION,
        etiqueta: 'El interés de financiación',
      }),
      mora: validarNumero(ajustes.tasaMoraMensualPorcentaje, {
        ...FINANCIACION,
        etiqueta: 'La tasa de mora',
      }),
      dias: validarEntero(ajustes.diasAvisoVencimiento, {
        ...DIAS_AVISO,
        etiqueta: 'Los días de aviso',
      }),
    };
    setErroresAjustes(errs);
    if (hayErrores(errs)) return;
    const interes = Number(ajustes.interesFinanciacionPorcentaje);
    const mora = Number(ajustes.tasaMoraMensualPorcentaje);
    const dias = Number(ajustes.diasAvisoVencimiento);
    const ok = await confirm({
      icon: 'warning',
      title: '¿Guardar la configuración?',
      message: 'Se van a sobrescribir los valores por defecto de interés, mora y avisos.',
      confirmText: 'Guardar',
    });
    if (!ok) return;
    setAjustesSaving(true);
    try {
      await actualizarAjustesCuenta({
        interesFinanciacionPorcentaje: interes,
        tasaMoraMensualPorcentaje: mora,
        diasAvisoVencimiento: Math.round(dias),
      });
      toast({ message: 'Ajustes guardados' });
      setShowAjustes(false);
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al guardar los ajustes') });
    } finally {
      setAjustesSaving(false);
    }
  };

  const saldoNum = Number(saldo.saldo) || 0;
  const saldoCls = saldoNum > 0 ? 'text-ios-red' : 'text-ios-green';
  const saldoTexto = saldoNum > 0 ? 'Deuda del cliente' : saldoNum < 0 ? 'Saldo a favor' : 'Libre de deuda';
  const sinDeuda = saldoNum <= 0;
  const cuotasVisibles = cuotas.filter((c) => c.estado !== 'cancelada');
  const cuotasVencidasArr = cuotas.filter((c) => c.vencida);
  const cuotasVencidas = cuotasVencidasArr.length;
  const totalVencido = cuotasVencidasArr.reduce((s, c) => s + (Number(c.saldoPendiente) || 0), 0);
  const totalMoraVencida = cuotasVencidasArr.reduce((s, c) => s + (Number(c.moraAcumulada) || 0), 0);

  return (
    <IosModal
      open={open}
      onClose={onClose}
      title={cliente ? `Cuenta corriente · ${cliente.nombre}` : 'Cuenta corriente'}
      maxWidth="max-w-2xl"
      showClose
    >
      <div className="space-y-4">
        <div className="rounded-2xl px-4 py-3 bg-ios-surface2/70 border border-ios-separator/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold">{saldoTexto}</p>
              <p className={`text-[26px] font-bold tabular-nums ${saldoCls}`}>{formatMoney(Math.abs(saldoNum))}</p>
            </div>
            <div className="flex items-start sm:items-center gap-1.5">
              <div className="text-left sm:text-right text-[12px] space-y-0.5">
                <p className="text-ios-secondary">
                  Débitos: <span className="text-ios-red font-semibold tabular-nums">{formatMoney(saldo.totalDebitos)}</span>
                </p>
                <p className="text-ios-secondary">
                  Créditos: <span className="text-ios-green font-semibold tabular-nums">{formatMoney(saldo.totalCreditos)}</span>
                </p>
              </div>
              {esAdmin && (
                <button
                  type="button"
                  onClick={abrirAjustes}
                  className="p-1.5 btn-icono btn-icono-gris"
                  title="Configuración de cuentas corrientes"
                  aria-label="Configuración de cuentas corrientes"
                >
                  <IconSettings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {cuotasVencidas > 0 && (
          <div className="rounded-2xl px-4 py-3 bg-ios-red/10 border border-ios-red/25 text-xs">
            <p className="font-bold text-ios-red">
              Atención: {cuotasVencidas} cuota{cuotasVencidas === 1 ? '' : 's'} vencida{cuotasVencidas === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-ios-red/90">
              Total vencido {formatMoney(totalVencido)}
              {totalMoraVencida > 0 ? ` (incluye mora ${formatMoney(totalMoraVencida)})` : ''}.
            </p>
          </div>
        )}

        {cuotasVisibles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ios-label">Cuotas en cuenta corriente</p>
              {cuotasVencidas > 0 && (
                <span className="text-[11px] font-semibold text-ios-red bg-ios-red/10 px-2 py-0.5 rounded-ios-pill">
                  {cuotasVencidas} vencida{cuotasVencidas === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {cuotasVisibles.map((cuota) => {
                const estado = estadoCuotaInfo(cuota);
                return (
                  <div key={cuota._id} className="rounded-2xl border border-ios-separator/30 bg-ios-surface px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ios-label">
                          Cuota {cuota.numero}/{cuota.totalCuotas}
                          {cuota.ticketNumero ? <span className="text-ios-tertiary font-normal"> · {cuota.ticketNumero}</span> : null}
                        </p>
                        <p className="text-[11px] text-ios-tertiary mt-0.5">
                          Vence {formatFechaMovimiento(cuota.fechaVencimiento)}
                          {Number(cuota.moraAcumulada) > 0 ? ` · Mora ${formatMoney(cuota.moraAcumulada)}` : ''}
                        </p>
                        {Number(cuota.pagado) > 0 && (
                          <p className="text-[11px] text-ios-secondary mt-0.5 tabular-nums">
                            Pagado {formatMoney(cuota.pagado)} de {formatMoney(cuota.monto)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-ios-pill ${estado.cls}`}>
                          {estado.label}
                        </span>
                        <p className="text-sm font-semibold text-ios-label tabular-nums">
                          {formatMoney(cuota.saldoPendiente ?? cuota.monto)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ios-label">Historial de movimientos</p>
          <div className="flex flex-wrap items-center gap-2">
            <IosButton
              size="sm"
              variant="tinted"
              onClick={abrirFormulario}
              disabled={sinDeuda}
              title={sinDeuda ? 'El cliente no tiene deuda pendiente' : undefined}
            >
              <IconCash className="w-4 h-4" /> Registrar pago
            </IosButton>
            <IosButton size="sm" variant="gray" onClick={() => setShowFormato(true)}>
              <IconPrint className="w-4 h-4" /> Imprimir estado
            </IosButton>
            {sinDeuda && (
              <span className="text-[11px] font-medium text-ios-green">
                {saldoNum < 0 ? 'El cliente tiene saldo a favor' : 'El cliente está libre de deuda'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <IosSelect value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
            <option value="" className="bg-ios-surface2">Todos los tipos</option>
            <option value="debito" className="bg-ios-surface2">Débitos</option>
            <option value="credito" className="bg-ios-surface2">Créditos</option>
          </IosSelect>
          <IosSelect value={filtros.origen} onChange={(e) => setFiltros((f) => ({ ...f, origen: e.target.value }))}>
            <option value="" className="bg-ios-surface2">Todos los orígenes</option>
            {ORIGENES.map((o) => (
              <option key={o.key} value={o.key} className="bg-ios-surface2">{o.label}</option>
            ))}
          </IosSelect>
          <IosInput
            type="date"
            max={hoyLocal()}
            invalid={Boolean(errorFiltros)}
            value={filtros.desde}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            aria-label="Desde"
          />
          <IosInput
            type="date"
            max={hoyLocal()}
            invalid={Boolean(errorFiltros)}
            value={filtros.hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            aria-label="Hasta"
          />
        </div>
        {errorFiltros && <p className="text-ios-red text-xs font-medium">{errorFiltros}</p>}
        <IosSearch
          value={filtros.buscar}
          onChange={(v) => setFiltros((f) => ({ ...f, buscar: v }))}
          placeholder="Buscar por referencia, nota o usuario"
        />

        {loading && movimientos.length === 0 && (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="h-7 w-7" />
          </div>
        )}
        {error && <p className="text-center text-sm text-ios-red py-4">{error}</p>}
        {!loading && !error && movimientos.length === 0 && (
          <p className="text-center text-sm text-ios-tertiary py-8">No hay movimientos con esos filtros</p>
        )}

        <div className="space-y-2">
          {movimientos.map((movimiento) => {
            const esDebito = movimiento.tipo === 'debito';
            const anulado = movimiento.estado === 'anulado';
            return (
              <div
                key={movimiento._id}
                className={`rounded-2xl border border-ios-separator/30 px-3.5 py-3 ${anulado ? 'opacity-50 bg-ios-surface2/40' : 'bg-ios-surface'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${anulado ? 'line-through text-ios-tertiary' : esDebito ? 'text-ios-red' : 'text-ios-green'}`}>
                      {esDebito ? '+' : '-'}{formatMoney(movimiento.monto)} · {origenLabel(movimiento.origen)}
                    </p>
                    <p className="text-[11px] text-ios-tertiary mt-0.5">
                      {formatFechaMovimiento(movimiento.fecha)}
                      {movimiento.referencia ? ` · ${movimiento.referencia}` : ''}
                      {movimiento.formaPago && movimiento.formaPago !== 'ninguno' ? ` · ${formaPagoLabel(movimiento.formaPago)}` : ''}
                    </p>
                    {movimiento.nota && <p className="text-[11px] text-ios-secondary mt-1 break-words">{movimiento.nota}</p>}
                    <p className="text-[10px] text-ios-tertiary mt-1">
                      {movimiento.registradoPor ? `Registró ${movimiento.registradoPor}` : ''}
                      {anulado && movimiento.motivoAnulacion ? ` · Anulado: ${movimiento.motivoAnulacion}` : ''}
                    </p>
                  </div>
                  {!anulado && (
                    <div className="flex items-center gap-1 shrink-0">
                      {esPago(movimiento) && (
                        <button
                          onClick={() => handleEditar(movimiento)}
                          className="p-1.5 btn-icono btn-icono-azul"
                          aria-label="Editar pago"
                        >
                          <IconPencil className="w-4 h-4" />
                        </button>
                      )}
                      {!esMovimientoDeSistema(movimiento) && (
                        <button
                          onClick={() => pedirAnular(movimiento)}
                          className="p-1.5 btn-icono btn-icono-rojo"
                          aria-label="Anular movimiento"
                        >
                          <IconX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <IosModal
        open={showForm}
        onClose={resetForm}
        title={editando ? 'Editar pago' : 'Registrar pago'}
        confirmText={saving ? 'Guardando…' : editando ? 'Guardar' : 'Registrar pago'}
        onConfirm={handleSubmit}
        confirmDisabled={saving}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <IosField label="Monto" required error={errores.monto}>
              <IosInput
                type="text"
                inputMode="decimal"
                maxLength={12}
                invalid={Boolean(errores.monto)}
                value={form.monto}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) {
                    setErrores((prev) => ({ ...prev, monto: '' }));
                    setForm((f) => ({ ...f, monto: v }));
                  }
                }}
                placeholder="0.00"
                autoFocus
              />
            </IosField>
            <IosField label="Fecha" error={errores.fecha}>
              <IosInput
                type="date"
                max={hoyLocal()}
                invalid={Boolean(errores.fecha)}
                value={form.fecha}
                onChange={(e) => {
                  setErrores((prev) => ({ ...prev, fecha: '' }));
                  setForm((f) => ({ ...f, fecha: e.target.value }));
                }}
              />
            </IosField>
          </div>
          <IosField label="Forma de pago" required>
            <IosSelect value={form.formaPago} onChange={(e) => setForm((f) => ({ ...f, formaPago: e.target.value }))}>
              {FORMAS_COBRO.map((fp) => (
                <option key={fp.key} value={fp.key} className="bg-ios-surface2">{fp.label}</option>
              ))}
            </IosSelect>
          </IosField>
          <IosField label="Referencia" hint="Factura, recibo o ticket (opcional)" error={errores.referencia}>
            <IosInput
              value={form.referencia}
              maxLength={LIMITES.referencia.max}
              invalid={Boolean(errores.referencia)}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, referencia: '' }));
                setForm((f) => ({ ...f, referencia: e.target.value }));
              }}
              placeholder="Ej: T-000123"
            />
          </IosField>
          <IosField label="Nota" error={errores.nota}>
            <IosTextArea
              rows={2}
              value={form.nota}
              maxLength={LIMITES.nota.max}
              invalid={Boolean(errores.nota)}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, nota: '' }));
                setForm((f) => ({ ...f, nota: e.target.value }));
              }}
              placeholder="Detalle opcional"
            />
          </IosField>
        </form>
      </IosModal>

      <IosModal
        open={Boolean(anulando)}
        onClose={() => {
          setAnulando(null);
          setMotivoAnular('');
          setErrorMotivo('');
        }}
        title="Anular movimiento"
        confirmText={anulandoSaving ? 'Anulando…' : 'Anular'}
        confirmVariant="destructive"
        onConfirm={handleAnular}
        confirmDisabled={anulandoSaving}
      >
        <p className="text-sm text-ios-secondary mb-3">
          El movimiento no se borra: queda registrado como anulado y deja de contar para el saldo.
        </p>
        <IosField label="Motivo" required error={errorMotivo}>
          <IosInput
            value={motivoAnular}
            maxLength={LIMITES.motivo.max}
            invalid={Boolean(errorMotivo)}
            onChange={(e) => {
              setErrorMotivo('');
              setMotivoAnular(e.target.value);
            }}
            placeholder="Ej: pago duplicado"
            autoFocus
          />
        </IosField>
      </IosModal>

      <IosModal
        open={showAjustes}
        onClose={() => setShowAjustes(false)}
        title="Configuración de cuentas corrientes"
        confirmText={ajustesSaving ? 'Guardando…' : 'Guardar'}
        onConfirm={guardarAjustes}
        confirmDisabled={ajustesSaving}
      >
        <p className="text-sm text-ios-secondary mb-3">
          Valores por defecto que verá el vendedor al cargar una venta en cuotas. Solo el administrador puede cambiarlos.
        </p>
        <div className="space-y-3">
          <IosField label="Interés de financiación por defecto (%)" error={erroresAjustes.interes}>
            <IosInput
              type="text"
              inputMode="decimal"
              maxLength={7}
              invalid={Boolean(erroresAjustes.interes)}
              value={ajustes.interesFinanciacionPorcentaje}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d{0,4}(\.\d{0,2})?$/.test(v)) {
                  setErroresAjustes((prev) => ({ ...prev, interes: '' }));
                  setAjustes((a) => ({ ...a, interesFinanciacionPorcentaje: v }));
                }
              }}
              placeholder="Ej: 10"
            />
          </IosField>
          <IosField label="Mora mensual por cuota atrasada (%)" error={erroresAjustes.mora}>
            <IosInput
              type="text"
              inputMode="decimal"
              maxLength={7}
              invalid={Boolean(erroresAjustes.mora)}
              value={ajustes.tasaMoraMensualPorcentaje}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d{0,4}(\.\d{0,2})?$/.test(v)) {
                  setErroresAjustes((prev) => ({ ...prev, mora: '' }));
                  setAjustes((a) => ({ ...a, tasaMoraMensualPorcentaje: v }));
                }
              }}
              placeholder="Ej: 5"
            />
          </IosField>
          <IosField label="Días de aviso antes del vencimiento" error={erroresAjustes.dias}>
            <IosInput
              type="text"
              inputMode="numeric"
              maxLength={2}
              invalid={Boolean(erroresAjustes.dias)}
              value={ajustes.diasAvisoVencimiento}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d{0,2}$/.test(v)) {
                  setErroresAjustes((prev) => ({ ...prev, dias: '' }));
                  setAjustes((a) => ({ ...a, diasAvisoVencimiento: v }));
                }
              }}
              placeholder="Ej: 3"
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={showFormato}
        onClose={() => setShowFormato(false)}
        title="Imprimir estado de cuenta"
        confirmText="Cerrar"
        onConfirm={() => setShowFormato(false)}
        showCancel={false}
      >
        <p className="text-sm text-ios-secondary mb-3">
          Incluye la deuda, los pagos con fecha y las cuotas pendientes del cliente.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <IosButton variant="tinted" onClick={() => imprimirEstado('a4')} disabled={imprimiendo}>
            <IconPrint className="w-4 h-4" /> Hoja A4
          </IosButton>
          <IosButton variant="gray" onClick={() => imprimirEstado('ticket')} disabled={imprimiendo}>
            <IconPrint className="w-4 h-4" /> Ticket 80mm
          </IosButton>
        </div>
        {imprimiendo && <p className="text-xs text-ios-tertiary mt-3 text-center">Preparando impresión…</p>}
      </IosModal>
    </IosModal>
  );
};

export default ClienteDetalle;
