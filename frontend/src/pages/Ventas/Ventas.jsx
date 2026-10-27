import { useState, useEffect, Fragment, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { obtenerVentas, obtenerEstadisticasVentas, obtenerMasVendidos, eliminarVenta, obtenerCierresCaja, eliminarCierreCaja, reenviarCorreoCierre, reenviarReporteDia } from '../../api/ventas';
import { useApi } from '../../hooks/useApi';
import RetiroModal from './RetiroModal';
import Ticket, { printTicket } from '../../components/Ticket/Ticket';
import FormularioDevolucion from '../../components/FormularioDevolucion/FormularioDevolucion';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { formatMoney, formatDate, formatDateSafe, formatDateShort } from '../../utils/format';
import { validarRangoFechas } from '../../utils/validacion';
import { escucharPush } from '../../services/GestorPush';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAutenticacion } from '../../context/autenticacionContexto';
import { useCaja } from '../../context/cajaContexto';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosToggle from '../../components/ui/IosToggle';
import IosSegmented from '../../components/ui/IosSegmented';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconChevronRight, IconChart, IconCash, IconBank, IconCard, IconTile, IconWallet } from '../../components/ui/icons';

const GraficosVentas = lazy(() => import('../../components/GraficosVentas/GraficosVentas'));

const metodosIcon = {
  efectivo: IconCash,
  transferencia: IconBank,
  tarjeta: IconCard,
  cuentaCorriente: IconWallet,
};

const metodosGradient = {
  efectivo: 'from-emerald-400 to-green-600',
  transferencia: 'from-sky-400 to-blue-600',
  tarjeta: 'from-violet-400 to-purple-600',
  cuentaCorriente: 'from-orange-400 to-amber-600',
};

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const mondayOfWeek = () => {
  const d = new Date();
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const sundayOfWeek = () => {
  const d = new Date();
  const diff = d.getDay() === 0 ? 0 : 7 - d.getDay();
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const firstOfMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const periodos = [
  { key: 'todas', label: 'Todas', desde: () => '', hasta: () => '' },
  { key: 'dia', label: 'Hoy', desde: today, hasta: today },
  { key: 'semana', label: 'Semana', desde: mondayOfWeek, hasta: sundayOfWeek },
  { key: 'mes', label: 'Mes', desde: firstOfMonth, hasta: today },
];

const getPagos = (s) =>
  (s.pagos && s.pagos.length > 0 ? s.pagos : [{ metodo: s.metodoPago || 'efectivo', monto: s.total }]);

const getItems = (s) =>
  (s.articulos && s.articulos.length > 0 ? s.articulos : [{ producto: s.producto, cantidad: s.cantidad, precio: s.precio, talle: s.talle }]);

const turnoLabel = (t) => (t === 'manana' ? 'Mañana' : t === 'tarde' ? 'Tarde' : 'Día completo');

const turnoTableLabel = (t) => (t === 'manana' ? 'Turno Mañana' : t === 'tarde' ? 'Turno Tarde' : 'Día completo');

const turnoBadge = (t) => {
  if (t === 'manana') return 'bg-sky-500/15 text-sky-400';
  if (t === 'tarde') return 'bg-orange-500/15 text-orange-400';
  return 'bg-ios-surface2 text-ios-secondary';
};

const fechaInputLocal = (fecha) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pagoBadge = (metodo) => {
  if (metodo === 'efectivo') return 'bg-green-500/15 text-green-400';
  if (metodo === 'transferencia') return 'bg-blue-500/15 text-blue-400';
  if (metodo === 'cuentaCorriente') return 'bg-orange-500/15 text-orange-400';
  return 'bg-purple-500/15 text-purple-400';
};

const pagoLabel = (metodo) =>
  metodo === 'efectivo'
    ? 'Efectivo'
    : metodo === 'transferencia'
      ? 'Transferencia'
      : metodo === 'cuentaCorriente'
        ? 'Cuenta corriente'
        : 'Tarjeta';

const getEstadoVenta = (s) => {
  if (s.estado === 'devuelta') return { label: 'Devuelto', cls: 'bg-ios-red/15 text-ios-red' };
  if ((Number(s.cantidadDevuelta) || 0) > 0) return { label: 'Devolución parcial', cls: 'bg-amber-500/15 text-amber-400' };
  return null;
};

const metodosResumen = [
  { key: 'efectivo', label: 'Efectivo', cls: 'text-green-400' },
  { key: 'transferencia', label: 'Transferencia', cls: 'text-blue-400' },
  { key: 'tarjeta', label: 'Tarjeta', cls: 'text-purple-400' },
  { key: 'cuentaCorriente', label: 'Cta. corriente', cls: 'text-orange-400' },
];

const DetailRow = ({ c }) => (
  <div className="flex items-center justify-between gap-3 px-2.5 py-2.5">
    <div className="min-w-0 text-left">
      <p className="text-sm font-semibold text-ios-label">{turnoLabel(c.turno)}</p>
      <p className="text-[11px] text-ios-tertiary">
        {new Date(c.cerradaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {c.cerradoPor || '—'}
      </p>
    </div>
    <div className="text-right shrink-0">
      <p className="text-[15px] font-bold text-ios-green whitespace-nowrap tabular-nums">{formatMoney(c.total)}</p>
      <p className="text-[11px] text-ios-tertiary">{c.cantidad} unid.</p>
    </div>
  </div>
);

const SaldosTurno = ({ turno }) => (
  <div className="pt-3 border-t border-ios-separator/40 mt-3 space-y-2 px-2.5">
    {metodosResumen.map((m) => {
      const info = turno[m.key] || { total: 0, cantidad: 0 };
      return (
        <div key={m.key} className="flex items-center justify-between">
          <span className="text-[13px] text-ios-secondary">{m.label}</span>
          <span className={`text-[13px] font-semibold whitespace-nowrap tabular-nums ${m.cls}`}>
            {formatMoney(Number(info.total))}
            <span className="text-ios-tertiary font-medium ml-1">({info.cantidad})</span>
          </span>
        </div>
      );
    })}
  </div>
);

const RetirosInfo = ({ turno }) => {
  const totalRetiros = Number(turno.totalRetiros) || 0;
  const efectivoDevuelto = Number(turno.efectivoDevuelto) || 0;
  const totalDevoluciones = Number(turno.totalDevoluciones) || 0;
  const cobrosCuentaCorriente = Number(turno.totalCobrosCuentaCorriente) || 0;
  if (totalRetiros <= 0 && efectivoDevuelto <= 0 && totalDevoluciones <= 0 && cobrosCuentaCorriente <= 0) return null;
  const fondoInicial = Number(turno.fondoInicial) || 0;
  const efectivoEsperado = Number.isFinite(turno.efectivoEsperado)
    ? turno.efectivoEsperado
    : Math.max(0, fondoInicial + Number(turno.efectivo?.total || 0) - totalRetiros - efectivoDevuelto);
  return (
    <div className="pt-3 border-t border-ios-separator/40 mt-3 space-y-1.5 px-2.5">
      <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold">Ajustes de efectivo</p>
      {turno.retiros?.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-[12px]">
          <span className="text-ios-secondary truncate">
            {r.motivo}
            <span className="text-ios-tertiary"> · {r.realizadoPor}</span>
          </span>
          <span className="text-ios-red font-semibold whitespace-nowrap">-{formatMoney(r.monto)}</span>
        </div>
      ))}
      {totalDevoluciones > 0 && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ios-secondary">Devoluciones</span>
          <span className="text-ios-red font-semibold whitespace-nowrap">-{formatMoney(totalDevoluciones)}</span>
        </div>
      )}
      {efectivoDevuelto > 0 && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ios-secondary">Reintegros en efectivo</span>
          <span className="text-ios-red font-semibold whitespace-nowrap">-{formatMoney(efectivoDevuelto)}</span>
        </div>
      )}
      {cobrosCuentaCorriente > 0 && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ios-secondary">Cobros cuenta corriente</span>
          <span className="text-green-400 font-semibold whitespace-nowrap">+{formatMoney(cobrosCuentaCorriente)}</span>
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[13px] text-ios-secondary font-medium">Efectivo esperado</span>
        <span className="text-[13px] text-ios-label font-bold whitespace-nowrap tabular-nums">{formatMoney(efectivoEsperado)}</span>
      </div>
    </div>
  );
};
const Ventas = () => {
  const { usuario, esAdmin } = useAutenticacion();
  const { show: alert, confirm, toast } = useIosAlert();
  const location = useLocation();

  const imprimirTicket = async (s) => {
    const ok = await printTicket(s);
    if (!ok) toast({ message: 'No se pudo imprimir. Reintentá o revisá la impresora.' });
  };

  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [activePeriodo, setActivePeriodo] = useState('dia');

  const [activeTab, setActiveTab] = useState(location.state?.tab === 'cierres' ? 'cierres' : 'ventas');

  const [cDesde, setCDesde] = useState(today);
  const [cHasta, setCHasta] = useState(today);
  const [cActivePeriodo, setCActivePeriodo] = useState('dia');
  const [cView, setCView] = useState('turno');

  const [expandedId, setExpandedId] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnIsCambio, setReturnIsCambio] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const errorRangoVentas = validarRangoFechas(desde, hasta);
  const errorRangoCierres = validarRangoFechas(cDesde, cHasta);

  const { caja, refresh: refreshCaja, openAbrir, openCerrar, diaCompleto, esDeHoy } = useCaja();

  const ventasApi = useApi(
    async () => {
      if (desde && hasta && desde > hasta) {
        return { data: { ventas: [], total: 0 }, stats: null, mostSold: [] };
      }
      const tz = new Date().getTimezoneOffset();
      const [ventasRes, statsRes, mostSoldRes] = await Promise.all([
        obtenerVentas({ desde, hasta, offset: tz }),
        obtenerEstadisticasVentas({ desde, hasta, offset: tz }),
        obtenerMasVendidos({ desde, hasta, offset: tz }),
      ]);
      const ventas = ventasRes.data?.ventas;
      return {
        data: { ventas: Array.isArray(ventas) ? ventas : [], total: ventasRes.data?.total || 0 },
        stats: statsRes.data,
        mostSold: mostSoldRes.data,
      };
    },
    { deps: [desde, hasta], mensajeError: 'Error al cargar ventas' }
  );
  const closesApi = useApi(
    async () => {
      if (cDesde && cHasta && cDesde > cHasta) return [];
      const res = await obtenerCierresCaja({
        desde: cDesde,
        hasta: cHasta,
        offset: new Date().getTimezoneOffset(),
        agrupar: cView,
      });
      return Array.isArray(res.data) ? res.data : [];
    },
    { auto: false, mensajeError: 'Error al cargar cierres' }
  );

  const { run: fetchData, loading } = ventasApi;
  const { run: fetchCloses, loading: closesLoading, error: closesError } = closesApi;
  const data = ventasApi.error ? { ventas: [], total: 0 } : ventasApi.data?.data || { ventas: [], total: 0 };
  const stats = ventasApi.error ? null : ventasApi.data?.stats ?? null;
  const mostSold = ventasApi.error ? [] : ventasApi.data?.mostSold || [];
  const fetchError = ventasApi.error;
  const closes = closesApi.error ? [] : closesApi.data || [];

  const viewCloseDetail = (d) => {
    const fechaStr = formatDateShort(d.fecha);
    const esDia = Array.isArray(d.turnos);
    const title = esDia ? `Cierre del ${fechaStr}` : `Cierre de ${turnoLabel(d.turno)} del ${fechaStr}`;

    alert({
      icon: 'success',
      title,
      buttons: [{ text: 'Cerrar', style: 'default' }],
      content: esDia ? (
        <div className="space-y-4">
          <div className="text-center pt-1 pb-1">
            <p className="text-xs text-ios-tertiary">Total del día</p>
            <p className="text-[26px] font-bold text-ios-label mt-1 whitespace-nowrap tabular-nums">{formatMoney(d.total)}</p>
            <p className="text-xs text-ios-tertiary mt-0.5">{d.cantidad} unidades vendidas</p>
          </div>
          <div className="h-px bg-ios-separator/50" />
          <div className="divide-y divide-ios-separator/40">
            {d.turnos.map((t, i) => (
              <div key={i}>
                <DetailRow c={t} />
                <SaldosTurno turno={t} />
                <RetirosInfo turno={t} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {(d.abiertoPor || d.cerradoPor || Number(d.fondoInicial) > 0) && (
            <div className="rounded-2xl px-4 py-3 bg-ios-surface2/70 border border-ios-separator/40 text-xs text-ios-secondary space-y-1 text-left">
              {d.abiertoPor && (
                <p>
                  Abrió <span className="font-semibold text-ios-label">{d.abiertoPor}</span>
                  {d.abiertaEn ? ` a las ${new Date(d.abiertaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              )}
              {d.cerradoPor && (
                <p>
                  Cerró <span className="font-semibold text-ios-label">{d.cerradoPor}</span>
                  {d.cerradaEn ? ` a las ${new Date(d.cerradaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              )}
              {Number(d.fondoInicial) > 0 && <p>Fondo inicial: {formatMoney(d.fondoInicial)}</p>}
              {Array.isArray(d.reaperturas) && d.reaperturas.length > 0 && (
                <p className="text-amber-400">
                  Reabierta {d.reaperturas.length} {d.reaperturas.length === 1 ? 'vez' : 'veces'} · última por{' '}
                  {d.reaperturas[d.reaperturas.length - 1].por}
                </p>
              )}
            </div>
          )}
          <div className="text-center pt-1">
            <p className="text-[26px] font-bold text-ios-green whitespace-nowrap tabular-nums">{formatMoney(d.total)}</p>
            <p className="text-xs text-ios-tertiary mt-0.5">{d.cantidad} unidades</p>
          </div>
          <SaldosTurno turno={d} />
          <RetirosInfo turno={d} />
        </div>
      ),
    });
  };

  const openWithdrawalModal = () => setWithdrawalOpen(true);

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar esta venta?',
      message: 'El stock se restaurará automáticamente',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarVenta(id);
      toast({ message: 'Venta eliminada' });
      setExpandedId(null);
      fetchData();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar venta') });
    }
  };

  const handleDeleteClose = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este cierre?',
      message: 'El cierre se eliminará permanentemente',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarCierreCaja(id);
      toast({ message: 'Cierre eliminado' });
      fetchCloses();
      refreshCaja();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar cierre') });
    }
  };

  const handleResendCloseMail = async (id) => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Reenviar el correo del cierre?',
      message: 'Se enviará de nuevo el resumen del cierre de caja por correo.',
      confirmText: 'Reenviar',
    });
    if (!ok) return;
    setResendingId(id);
    try {
      await reenviarCorreoCierre(id);
      toast({ message: 'Mail reenviado', duration: 2000 });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al reenviar el mail') });
    } finally {
      setResendingId(null);
    }
  };

  const handleResendReport = async (fecha) => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Reenviar el reporte del día?',
      message: 'Se enviará por correo el total del día con el desglose por turno y el listado de ventas.',
      confirmText: 'Reenviar',
    });
    if (!ok) return;
    const id = `dia-${fecha}`;
    setResendingId(id);
    try {
      await reenviarReporteDia({ fecha: fechaInputLocal(fecha), offset: new Date().getTimezoneOffset() });
      toast({ message: 'Reporte reenviado', duration: 2000 });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al reenviar el reporte') });
    } finally {
      setResendingId(null);
    }
  };

  useEffect(() => {
    if (activeTab !== 'cierres') return;
    fetchCloses();
  }, [activeTab, cDesde, cHasta, cView, fetchCloses]);

  useEffect(() => {
    const off = escucharPush((payload) => {
      const tipo = payload?.tipo;
      if (['venta', 'cierre', 'retiro', 'devolucion'].includes(tipo)) {
        fetchData();
        if (tipo === 'cierre' || tipo === 'retiro') {
          fetchCloses();
          refreshCaja();
        }
      }
    });
    return off;
  }, [fetchData, fetchCloses, refreshCaja]);

  useEffect(() => {
    if (activeTab === 'cierres') fetchCloses();
  }, [caja, activeTab, fetchCloses]);

  const selectPeriodo = (p) => {
    setActivePeriodo(p.key);
    setDesde(p.desde());
    setHasta(p.hasta());
  };

  const filtroFechas = (
    <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <IosField label="Desde">
          <IosInput
            type="date"
            max={today()}
            invalid={Boolean(errorRangoVentas)}
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              setActivePeriodo('');
            }}
            className="w-full sm:w-auto"
          />
        </IosField>
        <IosField label="Hasta">
          <IosInput
            type="date"
            max={today()}
            invalid={Boolean(errorRangoVentas)}
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value);
              setActivePeriodo('');
            }}
            className="w-full sm:w-auto"
          />
        </IosField>
      </div>
      {errorRangoVentas && <p className="text-ios-red text-xs font-medium">{errorRangoVentas}</p>}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {periodos.map((p) => (
          <button
            key={p.key}
            onClick={() => selectPeriodo(p)}
            className={`w-full sm:flex-1 px-3.5 py-2 rounded-ios-pill text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
              activePeriodo === p.key ? 'btn-vivo btn-vivo-azul' : 'btn-vivo btn-vivo-gris'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  // La pestaña de gráficos es solo para admin: para el resto cae siempre en Ventas.
  const tabEfectiva = !esAdmin && activeTab === 'graficos' ? 'ventas' : activeTab;
  const opcionesTab = [
    { value: 'ventas', label: 'Ventas' },
    ...(esAdmin ? [{ value: 'graficos', label: 'Gráficos' }] : []),
    { value: 'cierres', label: 'Cierres' },
  ];

  if (loading && tabEfectiva === 'ventas' && !ticketModal && !returnSale && !withdrawalOpen) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      {fetchError && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {fetchError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <IosSegmented
          options={opcionesTab}
          value={tabEfectiva}
          onChange={setActiveTab}
          className="w-full sm:w-auto"
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          {caja ? (
            <div
              className={`flex w-full sm:w-auto min-w-0 items-center gap-2 rounded-ios-pill pl-3.5 pr-1.5 py-1.5 border ${
                esDeHoy ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${esDeHoy ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'}`} />
              <span className={`min-w-0 flex-1 sm:flex-none truncate text-xs font-semibold ${esDeHoy ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {esDeHoy
                  ? `Caja abierta ${new Date(caja.abiertaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${caja.abiertoPor}`
                  : `Caja abierta del ${formatDateShort(caja.fecha)} · ${caja.abiertoPor}`}
              </span>
              <button
                onClick={openCerrar}
                className={`shrink-0 px-3 py-1.5 rounded-ios-pill text-xs font-bold ${
                  esDeHoy ? 'btn-vivo btn-vivo-verde' : 'btn-vivo btn-vivo-ambar'
                }`}
              >
                Cerrar caja
              </button>
            </div>
          ) : diaCompleto ? (
            <div className="flex w-full sm:w-auto min-w-0 items-center gap-2 bg-ios-surface2 border border-ios-separator/40 rounded-ios-pill pl-3.5 pr-1.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-ios-tertiary shrink-0" />
              <span className="min-w-0 flex-1 sm:flex-none truncate text-xs text-ios-secondary font-semibold">Caja cerrada hoy</span>
              <button
                onClick={() => setActiveTab('cierres')}
                className="shrink-0 px-3 py-1.5 rounded-ios-pill btn-vivo btn-vivo-azul text-xs font-bold"
              >
                Ver cierres
              </button>
            </div>
          ) : (
            <button
              onClick={openAbrir}
              className="w-full sm:w-auto px-4 py-2 rounded-ios-pill btn-vivo btn-vivo-ambar text-sm font-semibold"
            >
              Abrir caja
            </button>
          )}
          <IosButton
            variant="tinted"
            onClick={openWithdrawalModal}
            className="w-full sm:w-auto"
            disabled={!caja || !esDeHoy}
            title={!esDeHoy ? 'La caja abierta es de un día anterior' : undefined}
          >
            <IconCash className="w-4 h-4" />
            Retirar Efectivo
          </IosButton>
        </div>
      </div>

      {tabEfectiva === 'ventas' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 [&>*]:min-w-0">
            <div className="relative overflow-hidden rounded-3xl border border-ios-separator/30 bg-gradient-to-b from-ios-surface2/80 to-ios-surface p-5 shadow-ios-card">
              <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
              <IconTile gradient="from-emerald-400 to-green-600" className="w-11 h-11 shadow-[0_6px_16px_rgba(16,185,129,0.35)] mb-3.5">
                <IconChart className="w-5 h-5 text-white" strokeWidth={2.1} />
              </IconTile>
              <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold mb-1">Total Vendido</p>
              <p className="text-[26px] font-bold text-ios-label break-words leading-tight">
                {formatMoney(stats?.total || 0)}
              </p>
              <p className="text-xs text-ios-tertiary mt-1 font-medium">{stats?.cantidad || 0} unidades</p>
            </div>
            {metodosResumen.map((m) => {
              const Icon = metodosIcon[m.key];
              return (
                <div key={m.key} className="relative overflow-hidden rounded-3xl border border-ios-separator/30 bg-gradient-to-b from-ios-surface2/80 to-ios-surface p-5 shadow-ios-card">
                  <div className={`absolute -top-10 -right-10 w-36 h-36 rounded-full blur-2xl pointer-events-none bg-ios-hover/[0.06]`} />
                  <IconTile gradient={metodosGradient[m.key]} className="w-11 h-11 mb-3.5 shadow-[0_6px_16px_rgba(0,0,0,0.35)]">
                    <Icon className="w-5 h-5 text-white" strokeWidth={2.1} />
                  </IconTile>
                  <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold mb-1">{m.label}</p>
                  <p className={`text-[24px] font-bold ${m.cls} break-words leading-tight`}>
                    {formatMoney(stats?.[m.key]?.total || 0)}
                  </p>
                  <p className="text-xs text-ios-tertiary mt-1 font-medium">{stats?.[m.key]?.cantidad || 0} unidades</p>
                </div>
              );
            })}
          </div>

          {filtroFechas}

          <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ios-secondary text-sm font-medium">
              {!desde && !hasta
                ? 'Todas las ventas'
                : desde && !hasta
                  ? `Ventas desde ${formatDateSafe(desde)}`
                  : !desde && hasta
                    ? `Ventas hasta ${formatDateSafe(hasta)}`
                    : `Ventas del ${desde === hasta
                      ? formatDateSafe(desde)
                      : `${formatDateSafe(desde)} al ${formatDateSafe(hasta)}`}
              `}
            </p>
            <p className="text-[22px] font-bold text-ios-green break-words min-w-0">{formatMoney(data.total)}</p>
          </div>

          {mostSold.length > 0 && (
            <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4">
              <h2 className="text-[11px] text-ios-tertiary font-semibold uppercase tracking-wider mb-3">Productos más vendidos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {mostSold.map((item, i) => (
                  <div key={item.productoId} className="border border-ios-separator/30 rounded-2xl p-3 flex items-center gap-3 bg-ios-surface2/50">
                    <IconTile
                      gradient={['from-amber-400 to-orange-500', 'from-slate-400 to-slate-600', 'from-orange-300 to-amber-500'][i] || 'from-sky-500 to-blue-600'}
                      className="w-8 h-8"
                    >
                      <span className="text-[12px] font-bold text-white">{i + 1}</span>
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ios-label text-sm truncate">{item.nombre}</p>
                      <p className="text-xs text-ios-tertiary truncate">{item.categoria}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-ios-green">{formatMoney(item.ingresos)}</p>
                      <p className="text-xs text-ios-tertiary">{item.totalVendido} unid.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Productos</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Desc.</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Total</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Empleado</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Pago</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Fecha</th>
                  <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.ventas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-ios-tertiary text-sm">
                      No hay ventas en este periodo
                    </td>
                  </tr>
                ) : (
                  data.ventas.map((s) => {
                    const items = getItems(s);
                    const isExpanded = expandedId === s._id;
                    return (
                      <Fragment key={s._id}>
                        <tr
                          className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : s._id)}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <IconChevronRight
                                className={`w-4 h-4 text-ios-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                strokeWidth={2.2}
                              />
                              <span className="font-semibold text-ios-label">
                                {items[0]?.producto?.nombre || items[0]?.nombre || 'Producto'}
                                {items.length > 1 && <span className="text-ios-tertiary font-normal"> +{items.length - 1} más</span>}
                              </span>
                              {getEstadoVenta(s) && (
                                <span className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getEstadoVenta(s).cls}`}>
                                  {getEstadoVenta(s).label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-ios-tertiary">{s.descuento ? `${s.descuento}%` : '—'}</td>
                          <td className="px-4 py-3.5 text-ios-label font-semibold whitespace-nowrap tabular-nums">{formatMoney(s.total)}</td>
                          <td className="px-4 py-3.5 text-ios-secondary">{s.empleado}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {getPagos(s).map((p, i) => (
                                  <span
                                  key={i}
                                  className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${pagoBadge(p.metodo)}`}
                                >
                                  {pagoLabel(p.metodo)}
                                  <span className="ml-1 opacity-60 font-medium">{formatMoney(p.monto)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-ios-tertiary text-xs">{formatDate(s.fechaCreacion)}</td>
                          <td className="px-5 py-3.5 text-right">
                            {esAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s._id); }}
                                className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                              >
                                Eliminar
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${s._id}-expanded`}>
                            <td colSpan={7} className="px-0 py-0">
                              <div className="bg-ios-surface2/40 border-t border-ios-separator/30">
                                <div className="flex items-center justify-between px-5 pt-3">
                                  <span className="text-xs text-ios-tertiary uppercase tracking-wider font-semibold">Detalle de la venta</span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setReturnIsCambio(false); setReturnSale(s); }}
                                      disabled={s.estado === 'devuelta'}
                                      className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold disabled:opacity-40 disabled:pointer-events-none"
                                    >
                                      Devolver
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setReturnIsCambio(true); setReturnSale(s); }}
                                      disabled={s.estado === 'devuelta'}
                                      className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold disabled:opacity-40 disabled:pointer-events-none"
                                    >
                                      Cambiar
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setTicketModal(s); }}
                                      className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                                    >
                                      Ver ticket
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); imprimirTicket(s); }}
                                      className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                                    >
                                      Imprimir ticket
                                    </button>
                                  </div>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-[11px] text-ios-tertiary uppercase tracking-wider">
                                      <th className="text-left px-4 py-2 pl-12 font-semibold">Producto</th>
                                      <th className="text-left px-4 py-2 font-semibold">Categoria</th>
                                      <th className="text-left px-4 py-2 font-semibold">Cantidad</th>
                                      <th className="text-left px-4 py-2 font-semibold">Talle</th>
                                      <th className="text-left px-4 py-2 font-semibold">Precio Unit.</th>
                                      <th className="text-left px-4 py-2 font-semibold">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item, idx) => (
                                      <tr key={idx} className="border-t border-ios-separator/30">
                                        <td className="px-4 py-2.5 pl-12 text-ios-label font-medium">{item.producto?.nombre || item.nombre || 'Producto'}</td>
                                        <td className="px-4 py-2.5 text-ios-tertiary">{item.producto?.categoria || '—'}</td>
                                        <td className="px-4 py-2.5 text-ios-label">{item.cantidad}</td>
                                        <td className="px-4 py-2.5 text-ios-tertiary">{item.talle || '—'}</td>
                                        <td className="px-4 py-2.5 text-ios-tertiary">{formatMoney(item.precio)}</td>
                                        <td className="px-4 py-2.5 text-ios-label font-medium">{formatMoney(item.subtotal || item.precio * item.cantidad)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {data.ventas.length === 0 ? (
              <div className="text-center py-10 text-ios-tertiary text-sm">
                No hay ventas en este periodo
              </div>
            ) : (
              data.ventas.map((s) => {
                const items = getItems(s);
                const isExpanded = expandedId === s._id;
                const totalUnidades = items.reduce((acc, i) => acc + (Number(i.cantidad) || 0), 0);
                return (
                  <div key={s._id} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <p className="font-semibold text-ios-label truncate min-w-0 w-full sm:w-auto sm:flex-1">
                        {items[0]?.producto?.nombre || items[0]?.nombre || 'Producto'}
                        {items.length > 1 && <span className="text-ios-tertiary font-normal"> +{items.length - 1} más</span>}
                      </p>
                      {getEstadoVenta(s) && (
                        <span className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getEstadoVenta(s).cls}`}>
                          {getEstadoVenta(s).label}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 justify-end min-w-0 ml-auto">
                        {getPagos(s).map((p, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold ${pagoBadge(p.metodo)}`}
                          >
                            {pagoLabel(p.metodo)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[22px] font-bold text-ios-green break-words min-w-0">{formatMoney(s.total)}</p>
                      <p className="text-xs text-ios-tertiary shrink-0">{totalUnidades} unidades</p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-ios-separator/40">
                      <p className="text-xs text-ios-tertiary truncate min-w-0 flex-1">
                        {new Date(s.fechaCreacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {s.empleado}
                        {s.descuento ? ` · ${s.descuento}% desc.` : ''}
                      </p>
                      <div className="flex gap-2 shrink-0">
                        {esAdmin && (
                          <button
                            onClick={() => handleDelete(s._id)}
                            className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                          >
                            Eliminar
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : s._id)}
                          className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                        >
                          {isExpanded ? 'Ocultar' : 'Ver detalle'}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-ios-separator/40 space-y-2.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => { setReturnIsCambio(false); setReturnSale(s); }}
                            disabled={s.estado === 'devuelta'}
                            className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold disabled:opacity-40 disabled:pointer-events-none"
                          >
                            Devolver
                          </button>
                          <button
                            onClick={() => { setReturnIsCambio(true); setReturnSale(s); }}
                            disabled={s.estado === 'devuelta'}
                            className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold disabled:opacity-40 disabled:pointer-events-none"
                          >
                            Cambiar
                          </button>
                          <button
                            onClick={() => setTicketModal(s)}
                            className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                          >
                            Ver ticket
                          </button>
                          <button
                            onClick={() => imprimirTicket(s)}
                            className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                          >
                            Imprimir ticket
                          </button>
                        </div>
                        {items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-ios-label font-medium truncate">{item.producto?.nombre || item.nombre || 'Producto'}</p>
                              <p className="text-xs text-ios-tertiary">
                                {item.producto?.categoria || '—'}
                                {item.talle ? ` · Talle ${item.talle}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-ios-label">{item.cantidad} × {formatMoney(item.precio)}</p>
                              <p className="text-xs text-ios-green font-semibold">{formatMoney(item.subtotal || item.precio * item.cantidad)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : tabEfectiva === 'graficos' ? (
        <>
          {filtroFechas}
          <Suspense fallback={<LoadingSpinner />}>
            <GraficosVentas desde={desde} hasta={hasta} />
          </Suspense>
        </>
      ) : (
        <>
          {closesError && (
            <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
              {closesError}
            </div>
          )}

          <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <IosField label="Desde">
                  <IosInput
                    type="date"
                    max={today()}
                    invalid={Boolean(errorRangoCierres)}
                    value={cDesde}
                    onChange={(e) => {
                      setCDesde(e.target.value);
                      setCActivePeriodo('');
                    }}
                  />
                </IosField>
                <IosField label="Hasta">
                  <IosInput
                    type="date"
                    max={today()}
                    invalid={Boolean(errorRangoCierres)}
                    value={cHasta}
                    onChange={(e) => {
                      setCHasta(e.target.value);
                      setCActivePeriodo('');
                    }}
                  />
                </IosField>
              </div>
              {errorRangoCierres && <p className="text-ios-red text-xs font-medium">{errorRangoCierres}</p>}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-ios-tertiary uppercase tracking-wider font-semibold">
                  Vista por día
                </span>
                <IosToggle checked={cView === 'dia'} onChange={(v) => setCView(v ? 'dia' : 'turno')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {periodos.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setCActivePeriodo(p.key);
                    setCDesde(p.desde());
                    setCHasta(p.hasta());
                  }}
                  className={`w-full sm:flex-1 px-3.5 py-2 rounded-ios-pill text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
                    cActivePeriodo === p.key ? 'btn-vivo btn-vivo-azul' : 'btn-vivo btn-vivo-gris'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-x-auto">
            {closesLoading ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Fecha</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Turno</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Total</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cant.</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Efectivo</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Transferencia</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Tarjeta</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cta. cte.</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cerrado</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cerrado por</th>
                    <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {closes.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-ios-tertiary text-sm">
                        No hay cierres en este periodo
                      </td>
                    </tr>
                  ) : (
                    closes.map((c) => (
                      <tr key={c._id || c.fecha} className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-ios-label">{formatDateShort(c.fecha)}</td>
                        <td className="px-4 py-3.5">
                          {c.turnos ? (
                            <div className="flex flex-wrap gap-1">
                              {c.turnos.map((t, i) => (
                                <span key={i} className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(t.turno)}`}>
                                  {turnoTableLabel(t.turno)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(c.turno)}`}>
                              {turnoTableLabel(c.turno)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-ios-green font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.total)}</td>
                        <td className="px-4 py-3.5 text-ios-label">{c.cantidad}</td>
                        <td className="px-4 py-3.5 text-green-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.efectivo?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.efectivo?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-blue-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.transferencia?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.transferencia?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-purple-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.tarjeta?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.tarjeta?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-orange-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.cuentaCorriente?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.cuentaCorriente?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-ios-tertiary text-xs whitespace-nowrap">{new Date(c.cerradaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-3.5 text-ios-secondary">
                          {c.turnos
                            ? [...new Set(c.turnos.map((t) => t.cerradoPor).filter(Boolean))].join(' / ') || '—'
                            : c.cerradoPor || '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => viewCloseDetail(c)}
                              className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                            >
                              Ver
                            </button>
                            {c.turnos && esAdmin && (
                              <button
                                onClick={() => handleResendReport(c.fecha)}
                                disabled={resendingId === `dia-${c.fecha}`}
                                className={`text-xs px-2.5 py-1 rounded-ios-pill font-semibold ${
                                  resendingId === `dia-${c.fecha}`
                                    ? 'btn-vivo btn-vivo-ambar cursor-wait'
                                    : 'btn-vivo btn-vivo-verde'
                                }`}
                              >
                                {resendingId === `dia-${c.fecha}` ? 'Pendiente…' : 'Reenviar reporte'}
                              </button>
                            )}
                            {!c.turnos && esAdmin && (
                              <button
                                onClick={() => handleResendCloseMail(c._id)}
                                disabled={resendingId === c._id}
                                className={`text-xs px-2.5 py-1 rounded-ios-pill font-semibold ${
                                  resendingId === c._id
                                    ? 'btn-vivo btn-vivo-ambar cursor-wait'
                                    : 'btn-vivo btn-vivo-verde'
                                }`}
                              >
                                {resendingId === c._id ? 'Pendiente…' : 'Reenviar'}
                              </button>
                            )}
                            {!c.turnos && esAdmin && (
                              <button
                                onClick={() => handleDeleteClose(c._id)}
                                className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="md:hidden space-y-2.5">
            {closesLoading ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : closes.length === 0 ? (
              <div className="text-center py-10 text-ios-tertiary text-sm">
                No hay cierres en este periodo
              </div>
            ) : (
              closes.map((c) => (
                <div key={c._id || c.fecha} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="font-semibold text-ios-label">{formatDateShort(c.fecha)}</p>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {c.turnos ? (
                        c.turnos.map((t, i) => (
                          <span key={i} className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(t.turno)}`}>
                            {turnoTableLabel(t.turno)}
                          </span>
                        ))
                      ) : (
                        <span className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(c.turno)}`}>
                          {turnoTableLabel(c.turno)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[22px] font-bold text-ios-green">{formatMoney(c.total)}</p>
                    <p className="text-xs text-ios-tertiary">{c.cantidad} unidades</p>
                  </div>
                  <div className="space-y-2">
                    {metodosResumen.map((m) => (
                      <div key={m.key} className="flex items-center justify-between text-sm">
                        <span className="text-ios-tertiary">{m.label} <span className="text-ios-tertiary text-xs">({c[m.key]?.cantidad || 0} unid.)</span></span>
                        <span className={`font-semibold ${m.cls}`}>{formatMoney(c[m.key]?.total || 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-ios-separator/40">
                    <p className="text-xs text-ios-tertiary min-w-0 truncate">
                      {new Date(c.cerradaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {c.turnos
                        ? [...new Set(c.turnos.map((t) => t.cerradoPor).filter(Boolean))].join(' / ') || '—'
                        : c.cerradoPor || '—'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => viewCloseDetail(c)}
                        className="btn-vivo btn-vivo-azul text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                      >
                        Ver
                      </button>
                      {c.turnos && esAdmin && (
                        <button
                          onClick={() => handleResendReport(c.fecha)}
                          disabled={resendingId === `dia-${c.fecha}`}
                          className={`text-xs px-2.5 py-1 rounded-ios-pill font-semibold ${
                            resendingId === `dia-${c.fecha}`
                              ? 'btn-vivo btn-vivo-ambar cursor-wait'
                              : 'btn-vivo btn-vivo-verde'
                          }`}
                        >
                          {resendingId === `dia-${c.fecha}` ? 'Pendiente…' : 'Reenviar reporte'}
                        </button>
                      )}
                      {!c.turnos && esAdmin && (
                        <button
                          onClick={() => handleResendCloseMail(c._id)}
                          disabled={resendingId === c._id}
                          className={`text-xs px-2.5 py-1 rounded-ios-pill font-semibold ${
                            resendingId === c._id
                              ? 'btn-vivo btn-vivo-ambar cursor-wait'
                              : 'btn-vivo btn-vivo-verde'
                          }`}
                        >
                          {resendingId === c._id ? 'Pendiente…' : 'Reenviar'}
                        </button>
                      )}
                      {!c.turnos && esAdmin && (
                        <button
                          onClick={() => handleDeleteClose(c._id)}
                          className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <IosModal
        open={!!ticketModal}
        onClose={() => setTicketModal(null)}
        title="Ticket de venta"
        cancelText="Cerrar"
        showClose
        maxWidth="max-w-md"
      >
        {ticketModal && (
          <div className="w-full overflow-x-auto py-1">
            <div className="ticket-paper">
              <Ticket sale={ticketModal} />
            </div>
          </div>
        )}
      </IosModal>

      <FormularioDevolucion
        sale={returnSale}
        open={!!returnSale}
        defaultExchange={returnIsCambio}
        onClose={() => setReturnSale(null)}
        onDone={() => {
          fetchData();
          setTicketModal(null);
        }}
      />

      <RetiroModal
        open={withdrawalOpen}
        onClose={() => setWithdrawalOpen(false)}
        usuario={usuario}
        esAdmin={esAdmin}
        onDone={refreshCaja}
      />
    </div>
  );
};

export default Ventas;
