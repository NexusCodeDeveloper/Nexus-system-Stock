import { useState, useEffect, Fragment, useRef } from 'react';
import { obtenerVentas, obtenerEstadisticasVentas, obtenerMasVendidos, eliminarVenta, obtenerCierresCaja, eliminarCierreCaja, reenviarCorreoCierre } from '../../api/ventas';
import { crearRetiroCaja, obtenerRetirosCaja, eliminarRetiroCaja, obtenerDisponibleCaja } from '../../api/retirosCaja';
import Ticket, { printTicket } from '../../components/Ticket/Ticket';
import FormularioDevolucion from '../../components/FormularioDevolucion/FormularioDevolucion';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { formatMoney, formatDate, formatDateSafe, formatDateShort } from '../../utils/format';
import { escucharPush } from '../../services/GestorPush';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAutenticacion } from '../../context/AutenticacionContext';
import { useCaja } from '../../context/CajaContext';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosToggle from '../../components/ui/IosToggle';
import IosSegmented from '../../components/ui/IosSegmented';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconChevronRight, IconChart, IconCash, IconBank, IconCard, IconTile } from '../../components/ui/icons';

const metodosIcon = {
  efectivo: IconCash,
  transferencia: IconBank,
  tarjeta: IconCard,
};

const metodosGradient = {
  efectivo: 'from-emerald-400 to-green-600',
  transferencia: 'from-sky-400 to-blue-600',
  tarjeta: 'from-violet-400 to-purple-600',
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

const pagoBadge = (metodo) => {
  if (metodo === 'efectivo') return 'bg-green-500/15 text-green-400';
  if (metodo === 'transferencia') return 'bg-blue-500/15 text-blue-400';
  return 'bg-purple-500/15 text-purple-400';
};

const pagoLabel = (metodo) =>
  metodo === 'efectivo' ? 'Efectivo' : metodo === 'transferencia' ? 'Transferencia' : 'Tarjeta';

const getEstadoVenta = (s) => {
  if (s.estado === 'devuelta') return { label: 'Devuelto', cls: 'bg-ios-red/15 text-ios-red' };
  if ((Number(s.cantidadDevuelta) || 0) > 0) return { label: 'Devolución parcial', cls: 'bg-amber-500/15 text-amber-400' };
  return null;
};

const metodosResumen = [
  { key: 'efectivo', label: 'Efectivo', cls: 'text-green-400' },
  { key: 'transferencia', label: 'Transferencia', cls: 'text-blue-400' },
  { key: 'tarjeta', label: 'Tarjeta', cls: 'text-purple-400' },
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
  if (totalRetiros <= 0 && efectivoDevuelto <= 0 && totalDevoluciones <= 0) return null;
  const efectivoEsperado = Number.isFinite(turno.efectivoEsperado)
    ? turno.efectivoEsperado
    : Math.max(0, Number(turno.efectivo?.total || 0) - totalRetiros - efectivoDevuelto);
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
      <div className="flex items-center justify-between pt-1">
        <span className="text-[13px] text-ios-secondary font-medium">Efectivo esperado</span>
        <span className="text-[13px] text-ios-label font-bold whitespace-nowrap tabular-nums">{formatMoney(efectivoEsperado)}</span>
      </div>
    </div>
  );
};
const Ventas = () => {
  const { usuario } = useAutenticacion();
  const { show: alert, confirm, toast } = useIosAlert();

  const imprimirTicket = async (s) => {
    const ok = await printTicket(s);
    if (!ok) toast({ message: 'Habilitá las ventanas emergentes para imprimir' });
  };

  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [activePeriodo, setActivePeriodo] = useState('dia');
  const [data, setData] = useState({ ventas: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [mostSold, setMostSold] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [activeTab, setActiveTab] = useState('ventas');

  const [cDesde, setCDesde] = useState(today);
  const [cHasta, setCHasta] = useState(today);
  const [cActivePeriodo, setCActivePeriodo] = useState('dia');
  const [cView, setCView] = useState('turno');
  const [closes, setCloses] = useState([]);
  const [closesLoading, setClosesLoading] = useState(false);
  const [closesError, setClosesError] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnIsCambio, setReturnIsCambio] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  const { caja, refresh: refreshCaja, openAbrir, openCerrar, cierreHoy, esDeHoy, openReabrir } = useCaja();

  const ventasSeqRef = useRef(0);
  const cierresSeqRef = useRef(0);
  const retirosSeqRef = useRef(0);
  const efectivoSeqRef = useRef(0);

  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalMonto, setWithdrawalMonto] = useState('');
  const [withdrawalMotivo, setWithdrawalMotivo] = useState('');
  const [withdrawalSaving, setWithdrawalSaving] = useState(false);
  const [retiros, setRetiros] = useState([]);
  const [retirosTotal, setRetirosTotal] = useState(0);
  const [retirosLoading, setRetirosLoading] = useState(false);
  const [retirosError, setRetirosError] = useState('');
  const [efectivoDisponible, setEfectivoDisponible] = useState(null);
  const [efectivoError, setEfectivoError] = useState('');

  const fetchData = () => {
    const seq = ++ventasSeqRef.current;
    setLoading(true);
    setFetchError('');
    const tz = new Date().getTimezoneOffset();
    Promise.all([
      obtenerVentas({ desde, hasta, offset: tz }),
      obtenerEstadisticasVentas({ desde, hasta, offset: tz }),
      obtenerMasVendidos({ desde, hasta, offset: tz }),
    ])
      .then(([ventasRes, statsRes, mostSoldRes]) => {
        if (seq !== ventasSeqRef.current) return;
        const ventas = ventasRes.data?.ventas;
        setData({ ventas: Array.isArray(ventas) ? ventas : [], total: ventasRes.data?.total || 0 });
        setStats(statsRes.data);
        setMostSold(mostSoldRes.data);
      })
      .catch((err) => {
        if (seq !== ventasSeqRef.current) return;
        setFetchError(obtenerMensajeErrorApi(err, 'Error al cargar ventas'));
      })
      .finally(() => {
        if (seq === ventasSeqRef.current) setLoading(false);
      });
  };

  const fetchCloses = (d = cDesde, h = cHasta) => {
    const seq = ++cierresSeqRef.current;
    setClosesLoading(true);
    setClosesError('');
    obtenerCierresCaja({ desde: d, hasta: h, offset: new Date().getTimezoneOffset(), agrupar: cView })
      .then((res) => {
        if (seq !== cierresSeqRef.current) return;
        setCloses(res.data);
      })
      .catch((err) => {
        if (seq !== cierresSeqRef.current) return;
        setClosesError(obtenerMensajeErrorApi(err, 'Error al cargar cierres'));
      })
      .finally(() => {
        if (seq === cierresSeqRef.current) setClosesLoading(false);
      });
  };

  const viewCloseDetail = (d) => {
    const fechaStr = new Date(d.fecha).toLocaleDateString('es-AR');
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

  const openWithdrawalModal = () => {
    setWithdrawalOpen(true);
    setWithdrawalMonto('');
    setWithdrawalMotivo('');
    fetchWithdrawals();
    fetchAvailableCash();
  };

  const fetchAvailableCash = () => {
    const seq = ++efectivoSeqRef.current;
    setEfectivoError('');
    obtenerDisponibleCaja({ offset: new Date().getTimezoneOffset() })
      .then((res) => {
        if (seq !== efectivoSeqRef.current) return;
        setEfectivoDisponible(Number(res.data.disponible) || 0);
      })
      .catch((err) => {
        if (seq !== efectivoSeqRef.current) return;
        setEfectivoDisponible(null);
        setEfectivoError(obtenerMensajeErrorApi(err, 'No se pudo consultar el efectivo disponible'));
      });
  };

  const fetchWithdrawals = () => {
    const seq = ++retirosSeqRef.current;
    setRetirosLoading(true);
    setRetirosError('');
    obtenerRetirosCaja({ desde: today(), hasta: today(), offset: new Date().getTimezoneOffset() })
      .then((res) => {
        if (seq !== retirosSeqRef.current) return;
        setRetiros(res.data.retiros || []);
        setRetirosTotal(res.data.total || 0);
      })
      .catch((err) => {
        if (seq !== retirosSeqRef.current) return;
        setRetirosError(obtenerMensajeErrorApi(err, 'No se pudieron cargar los retiros'));
      })
      .finally(() => {
        if (seq === retirosSeqRef.current) setRetirosLoading(false);
      });
  };

  const confirmWithdrawal = async () => {
    if (withdrawalSaving) return;
    const monto = Number(withdrawalMonto);
    if (!Number.isFinite(monto) || monto <= 0) {
      alert({ icon: 'warning', title: 'Monto inválido', message: 'Debe ingresar un monto mayor a $0' });
      return;
    }
    if (efectivoDisponible != null && monto > efectivoDisponible) {
      alert({ icon: 'warning', title: 'Sin efectivo suficiente', message: `Solo hay ${formatMoney(efectivoDisponible)} disponibles en caja` });
      return;
    }
    if (!withdrawalMotivo.trim()) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe ingresar el motivo del retiro' });
      return;
    }
    setWithdrawalSaving(true);
    try {
      await crearRetiroCaja({
        monto: Math.round(monto * 100) / 100,
        motivo: withdrawalMotivo.trim(),
        offset: new Date().getTimezoneOffset(),
      });
      setWithdrawalMonto('');
      setWithdrawalMotivo('');
      toast({ message: 'Retiro registrado' });
      fetchWithdrawals();
      fetchAvailableCash();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al registrar el retiro') });
    } finally {
      setWithdrawalSaving(false);
    }
  };

  const handleDeleteWithdrawal = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este retiro?',
      message: 'El retiro se eliminará del registro',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarRetiroCaja(id);
      toast({ message: 'Retiro eliminado' });
      fetchWithdrawals();
      fetchAvailableCash();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar el retiro') });
    }
  };

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
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar cierre') });
    }
  };

  const handleResendCloseMail = async (id) => {
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

  useEffect(() => {
    fetchData();
  }, [desde, hasta]);

  useEffect(() => {
    if (activeTab !== 'cierres') return;
    fetchCloses();
  }, [activeTab, cDesde, cHasta, cView]);

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
  }, [desde, hasta, cDesde, cHasta, cView, refreshCaja]);

  useEffect(() => {
    if (activeTab === 'cierres') fetchCloses();
  }, [caja]);

  const selectPeriodo = (p) => {
    setActivePeriodo(p.key);
    setDesde(p.desde());
    setHasta(p.hasta());
  };

  if (loading && activeTab === 'ventas' && !ticketModal && !returnSale && !withdrawalOpen) {
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
          options={[{ value: 'ventas', label: 'Ventas' }, { value: 'cierres', label: 'Cierres' }]}
          value={activeTab}
          onChange={setActiveTab}
          className="w-full sm:w-auto"
        />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {caja ? (
            <div
              className={`flex flex-1 sm:flex-none items-center gap-2 rounded-ios-pill pl-3.5 pr-1.5 py-1.5 border ${
                esDeHoy ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${esDeHoy ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className={`text-xs font-semibold whitespace-nowrap ${esDeHoy ? 'text-emerald-300' : 'text-amber-300'}`}>
                {esDeHoy
                  ? `Caja abierta ${new Date(caja.abiertaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${caja.abiertoPor}`
                  : `Caja abierta del ${new Date(caja.fecha).toLocaleDateString('es-AR')} · ${caja.abiertoPor}`}
              </span>
              <button
                onClick={openCerrar}
                className={`shrink-0 px-3 py-1.5 rounded-ios-pill text-xs font-bold transition-colors ${
                  esDeHoy
                    ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                }`}
              >
                Cerrar caja
              </button>
            </div>
          ) : cierreHoy ? (
            <div className="flex flex-1 sm:flex-none items-center gap-2 bg-ios-surface2 border border-ios-separator/40 rounded-ios-pill pl-3.5 pr-1.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-ios-tertiary shrink-0" />
              <span className="text-xs text-ios-secondary font-semibold whitespace-nowrap">Caja cerrada hoy</span>
              {usuario?.rol === 'admin' ? (
                <button
                  onClick={openReabrir}
                  className="shrink-0 px-3 py-1.5 rounded-ios-pill bg-ios-tint/20 text-ios-tint text-xs font-bold hover:bg-ios-tint/30 transition-colors"
                >
                  Reabrir caja
                </button>
              ) : (
                <span className="shrink-0 px-3 py-1.5 text-[11px] text-ios-tertiary whitespace-nowrap">
                  Solo el admin puede reabrirla
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={openAbrir}
              className="flex-1 sm:flex-none px-4 py-2 rounded-ios-pill bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-semibold hover:bg-amber-500/25 transition-colors"
            >
              Abrir caja
            </button>
          )}
          <IosButton variant="tinted" onClick={openWithdrawalModal} className="flex-1 sm:flex-none" disabled={!caja}>
            <IconCash className="w-4 h-4" />
            Retirar Efectivo
          </IosButton>
        </div>
      </div>

      {activeTab === 'ventas' ? (
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

          <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <IosField label="Desde">
                <IosInput
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-full sm:w-auto"
                />
              </IosField>
              <IosField label="Hasta">
                <IosInput
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-full sm:w-auto"
                />
              </IosField>
            </div>
            <div className="flex gap-2">
              {periodos.map((p) => (
                <button
                  key={p.key}
                  onClick={() => selectPeriodo(p)}
                  className={`flex-1 px-3.5 py-2 rounded-ios-pill text-sm font-semibold transition-all ios-btn-press ${
                    activePeriodo === p.key
                      ? 'bg-ios-tint text-white shadow-[0_3px_10px_rgba(10,132,255,0.3)]'
                      : 'bg-ios-surface2 text-ios-tertiary hover:text-ios-secondary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

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
                                {items[0]?.producto?.nombre || 'Producto'}
                                {items.length > 1 && <span className="text-ios-tertiary font-normal"> +{items.length - 1} más</span>}
                              </span>
                              {getEstadoVenta(s) && (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getEstadoVenta(s).cls}`}>
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
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${pagoBadge(p.metodo)}`}
                                >
                                  {pagoLabel(p.metodo)}
                                  <span className="ml-1 opacity-60 font-medium">{formatMoney(p.monto)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-ios-tertiary text-xs">{formatDate(s.fechaCreacion)}</td>
                          <td className="px-5 py-3.5 text-right">
                            {usuario?.rol === 'admin' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s._id); }}
                                className="text-ios-red hover:text-ios-red/80 text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
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
                                      className="text-ios-red hover:text-ios-red/80 text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold disabled:opacity-40 disabled:pointer-events-none"
                                    >
                                      Devolver
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setReturnIsCambio(true); setReturnSale(s); }}
                                      disabled={s.estado === 'devuelta'}
                                      className="text-ios-tint hover:text-ios-tint/80 text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold disabled:opacity-40 disabled:pointer-events-none"
                                    >
                                      Cambiar
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setTicketModal(s); }}
                                      className="text-ios-tint hover:text-ios-tint/80 text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                                    >
                                      Ver ticket
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); imprimirTicket(s); }}
                                      className="text-ios-tint hover:text-ios-tint/80 text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
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
                                        <td className="px-4 py-2.5 pl-12 text-ios-label font-medium">{item.producto?.nombre || 'Producto'}</td>
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
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-semibold text-ios-label truncate min-w-0">
                        {items[0]?.producto?.nombre || 'Producto'}
                        {items.length > 1 && <span className="text-ios-tertiary font-normal"> +{items.length - 1} más</span>}
                      </p>
                      {getEstadoVenta(s) && (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getEstadoVenta(s).cls}`}>
                          {getEstadoVenta(s).label}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 justify-end shrink-0">
                        {getPagos(s).map((p, i) => (
                          <span
                            key={i}
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${pagoBadge(p.metodo)}`}
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
                        {usuario?.rol === 'admin' && (
                          <button
                            onClick={() => handleDelete(s._id)}
                            className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
                          >
                            Eliminar
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : s._id)}
                          className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
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
                            className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold disabled:opacity-40 disabled:pointer-events-none"
                          >
                            Devolver
                          </button>
                          <button
                            onClick={() => { setReturnIsCambio(true); setReturnSale(s); }}
                            disabled={s.estado === 'devuelta'}
                            className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold disabled:opacity-40 disabled:pointer-events-none"
                          >
                            Cambiar
                          </button>
                          <button
                            onClick={() => setTicketModal(s)}
                            className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                          >
                            Ver ticket
                          </button>
                          <button
                            onClick={() => imprimirTicket(s)}
                            className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                          >
                            Imprimir ticket
                          </button>
                        </div>
                        {items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-ios-label font-medium truncate">{item.producto?.nombre || 'Producto'}</p>
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
                    value={cDesde}
                    onChange={(e) => setCDesde(e.target.value)}
                  />
                </IosField>
                <IosField label="Hasta">
                  <IosInput
                    type="date"
                    value={cHasta}
                    onChange={(e) => setCHasta(e.target.value)}
                  />
                </IosField>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-ios-tertiary uppercase tracking-wider font-semibold">
                  Vista por día
                </span>
                <IosToggle checked={cView === 'dia'} onChange={(v) => setCView(v ? 'dia' : 'turno')} />
              </div>
            </div>
            <div className="flex gap-2">
              {periodos.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setCActivePeriodo(p.key);
                    setCDesde(p.desde());
                    setCHasta(p.hasta());
                  }}
                  className={`flex-1 px-3.5 py-2 rounded-ios-pill text-sm font-semibold transition-all ios-btn-press ${
                    cActivePeriodo === p.key
                      ? 'bg-ios-tint text-white shadow-[0_3px_10px_rgba(10,132,255,0.3)]'
                      : 'bg-ios-surface2 text-ios-tertiary hover:text-ios-secondary'
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
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cerrado</th>
                    <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cerrado por</th>
                    <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {closes.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-ios-tertiary text-sm">
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
                                <span key={i} className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(t.turno)}`}>
                                  {turnoTableLabel(t.turno)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(c.turno)}`}>
                              {turnoTableLabel(c.turno)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-ios-green font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.total)}</td>
                        <td className="px-4 py-3.5 text-ios-label">{c.cantidad}</td>
                        <td className="px-4 py-3.5 text-green-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.efectivo?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.efectivo?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-blue-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.transferencia?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.transferencia?.cantidad || 0})</span></td>
                        <td className="px-4 py-3.5 text-purple-400 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.tarjeta?.total || 0)} <span className="text-ios-tertiary text-xs font-medium">({c.tarjeta?.cantidad || 0})</span></td>
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
                              className="text-ios-tint hover:text-ios-tint/80 text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                            >
                              Ver
                            </button>
                            {!c.turnos && usuario?.rol === 'admin' && (
                              <button
                                onClick={() => handleResendCloseMail(c._id)}
                                disabled={resendingId === c._id}
                                className={`text-xs border px-2.5 py-1 rounded-ios-pill transition-all font-semibold ${
                                  resendingId === c._id
                                    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10 cursor-wait'
: 'text-emerald-400 hover:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10'
                                }`}
                              >
                                {resendingId === c._id ? 'Pendiente…' : 'Reenviar'}
                              </button>
                            )}
                            {!c.turnos && usuario?.rol === 'admin' && (
                              <button
                                onClick={() => handleDeleteClose(c._id)}
                                className="text-ios-red hover:text-ios-red/80 text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
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
                          <span key={i} className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(t.turno)}`}>
                            {turnoTableLabel(t.turno)}
                          </span>
                        ))
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${turnoBadge(c.turno)}`}>
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
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-ios-separator/40">
                    <p className="text-xs text-ios-tertiary">
                      {new Date(c.cerradaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {c.turnos
                        ? [...new Set(c.turnos.map((t) => t.cerradoPor).filter(Boolean))].join(' / ') || '—'
                        : c.cerradoPor || '—'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewCloseDetail(c)}
                        className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
                      >
                        Ver
                      </button>
                      {!c.turnos && usuario?.rol === 'admin' && (
                        <button
                          onClick={() => handleResendCloseMail(c._id)}
                          disabled={resendingId === c._id}
                          className={`text-xs border px-2.5 py-1 rounded-ios-pill transition-all font-semibold ${
                            resendingId === c._id
                              ? 'text-amber-400 border-amber-500/30 bg-amber-500/10 cursor-wait'
                              : 'text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {resendingId === c._id ? 'Pendiente…' : 'Reenviar'}
                        </button>
                      )}
                      {!c.turnos && usuario?.rol === 'admin' && (
                        <button
                          onClick={() => handleDeleteClose(c._id)}
                          className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
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

      <IosModal
        open={withdrawalOpen}
        onClose={() => setWithdrawalOpen(false)}
        title="Retirar Efectivo"
        cancelText="Cerrar"
        confirmText={withdrawalSaving ? 'Guardando…' : 'Registrar retiro'}
        confirmVariant="tinted"
        onConfirm={confirmWithdrawal}
        confirmDisabled={withdrawalSaving}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border flex items-center justify-between ${
            efectivoDisponible != null && efectivoDisponible > 0
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
          }`}>
            <span>Efectivo disponible en caja</span>
            <span className="tabular-nums">{efectivoDisponible != null ? formatMoney(efectivoDisponible) : '—'}</span>
          </div>
          {efectivoError && (
            <p className="text-amber-400 text-xs">{efectivoError}</p>
          )}

          <div className="bg-ios-surface rounded-2xl border border-ios-separator/30 p-4 space-y-3">
            <IosField label="Monto a retirar" required>
              <IosInput
                type="text"
                inputMode="decimal"
                value={withdrawalMonto}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setWithdrawalMonto(v);
                }}
                placeholder="0.00"
              />
            </IosField>
            <IosField label="Motivo" required>
              <IosInput
                type="text"
                value={withdrawalMotivo}
                onChange={(e) => setWithdrawalMotivo(e.target.value)}
                placeholder="Ej: pago a proveedor, gastos menores..."
              />
            </IosField>
            <IosField label="Retira">
              <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-secondary text-sm truncate">
                {usuario?.nombre || '—'}
              </div>
            </IosField>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-ios-secondary font-medium">Retiros de hoy</p>
              {retiros.length > 0 && (
                <span className="text-xs text-ios-tertiary font-semibold">
                  Total: {formatMoney(retirosTotal)}
                </span>
              )}
            </div>
            {retirosLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="h-6 w-6" />
              </div>
            ) : retirosError ? (
              <p className="text-center text-xs text-ios-red py-5 bg-ios-surface2/50 rounded-2xl">
                {retirosError}
              </p>
            ) : retiros.length === 0 ? (
              <p className="text-center text-xs text-ios-tertiary py-5 bg-ios-surface2/50 rounded-2xl">
                No hay retiros registrados hoy
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {retiros.map((w) => (
                  <div key={w._id} className="flex items-center gap-3 bg-ios-surface2/60 rounded-2xl px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ios-label truncate">{formatMoney(w.monto)}</p>
                      <p className="text-[11px] text-ios-tertiary truncate">
                        {w.motivo} · {w.realizadoPor} · {new Date(w.fechaCreacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {usuario?.rol === 'admin' && (
                      <button
                        onClick={() => handleDeleteWithdrawal(w._id)}
                        className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold shrink-0"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </IosModal>
    </div>
  );
};

export default Ventas;
