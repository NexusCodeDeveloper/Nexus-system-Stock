import { useState, useEffect, Fragment } from 'react';
import { getSales, getSalesStats, getMostSold, deleteSale, getDailyClose, getDailyCloses, deleteDailyClose, resendCloseMail } from '../../api/sales';
import Ticket, { printTicket } from '../../components/Ticket/Ticket';
import ReturnForm from '../../components/ReturnForm/ReturnForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosToggle from '../../components/ui/IosToggle';
import IosSegmented from '../../components/ui/IosSegmented';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { IconX, IconChevronRight, IconChart, IconCash, IconBank, IconCard, IconTile } from '../../components/ui/icons';

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

const formatDate = (date) =>
  new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMoney = (n) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

const getPagos = (s) =>
  (s.pagos && s.pagos.length > 0 ? s.pagos : [{ metodo: s.metodoPago || 'efectivo', monto: s.total }]);

const getItems = (s) =>
  (s.items && s.items.length > 0 ? s.items : [{ producto: s.producto, cantidad: s.cantidad, precio: s.precio, talle: s.talle }]);

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
        {new Date(c.cerradoAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {c.cerradoPor || '—'}
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
const Sales = () => {
  const { user } = useAuth();
  const { show: alert, confirm, toast } = useIosAlert();

  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [activePeriodo, setActivePeriodo] = useState('dia');
  const [data, setData] = useState({ sales: [], total: 0 });
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

  const [expandedId, setExpandedId] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnIsCambio, setReturnIsCambio] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [showCloseHint, setShowCloseHint] = useState(true);

  const [closeForm, setCloseForm] = useState(null);
  const [closeFecha, setCloseFecha] = useState(today);
  const [closeNombre, setCloseNombre] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);

  const fetchData = () => {
    setLoading(true);
    setFetchError('');
    const tz = new Date().getTimezoneOffset();
    Promise.all([
      getSales({ desde, hasta, offset: tz }),
      getSalesStats({ desde, hasta, offset: tz }),
      getMostSold({ desde, hasta, offset: tz }),
    ])
      .then(([salesRes, statsRes, mostSoldRes]) => {
        setData(salesRes.data);
        setStats(statsRes.data);
        setMostSold(mostSoldRes.data);
      })
      .catch((err) => {
        setFetchError(err.response?.data?.message || 'Error al cargar ventas');
      })
      .finally(() => setLoading(false));
  };

  const fetchCloses = () => {
    setClosesLoading(true);
    getDailyCloses({ desde: cDesde, hasta: cHasta, offset: new Date().getTimezoneOffset(), agrupar: cView })
      .then((res) => setCloses(res.data))
      .catch(() => {})
      .finally(() => setClosesLoading(false));
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
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-center pt-1">
            <p className="text-[26px] font-bold text-ios-green whitespace-nowrap tabular-nums">{formatMoney(d.total)}</p>
            <p className="text-xs text-ios-tertiary mt-0.5">{d.cantidad} unidades</p>
          </div>
          <SaldosTurno turno={d} />
        </div>
      ),
    });
  };

  const openCloseForm = (turno) => {
    setCloseForm(turno);
    setCloseFecha(today());
    setCloseNombre('');
  };

  const doDailyClose = async () => {
    if (closeSaving) return;
    const nombre = closeNombre.trim();
    if (!nombre) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe indicar quién cierra el turno' });
      return;
    }
    const turno = closeForm;
    const hoy = today();

    if (closeFecha !== hoy) {
      const confirmado = await confirm({
        icon: 'warning',
        title: `¿Cerrar el turno del ${new Date(`${closeFecha}T00:00:00`).toLocaleDateString('es-AR')}?`,
        message: 'Estás cerrando un turno de un día anterior. Verificá los montos antes de confirmar.',
        confirmText: 'Sí, cerrar',
      });
      if (!confirmado) return;
    }

    setCloseSaving(true);
    try {
      const params = { offset: new Date().getTimezoneOffset(), turno, cerradoPor: nombre };
      if (closeFecha !== hoy) params.fecha = closeFecha;
      const res = await getDailyClose(params);
      const d = res.data;
      setCloseForm(null);
      setCloseSaving(false);

      const fechaLabel = new Date(d.fecha).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      await alert({
        icon: 'success',
        title: `Cierre de ${turnoLabel(turno)}`,
        buttons: [{ text: 'Ver en historial', style: 'default' }],
        content: (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-xs text-ios-tertiary">{fechaLabel} · Cerrado por {d.cerradoPor}</p>
              <p className="text-[26px] font-bold text-ios-label mt-2 whitespace-nowrap tabular-nums">{formatMoney(d.total)}</p>
              <p className="text-xs text-ios-tertiary">{d.cantidad} unidades vendidas</p>
            </div>
            <SaldosTurno turno={d} />
          </div>
        ),
      });

      setActiveTab('cierres');
      setCDesde(today());
      setCHasta(today());
      setCActivePeriodo('dia');
      fetchCloses();
    } catch (err) {
      setCloseSaving(false);
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al obtener cierre de caja' });
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
      await deleteSale(id);
      toast({ message: 'Venta eliminada' });
      setExpandedId(null);
      fetchData();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al eliminar venta' });
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
      await deleteDailyClose(id);
      toast({ message: 'Cierre eliminado' });
      fetchCloses();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al eliminar cierre' });
    }
  };

  const handleResendCloseMail = async (id) => {
    setResendingId(id);
    try {
      await resendCloseMail(id);
      toast({ message: 'Mail reenviado', duration: 2000 });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al reenviar el mail' });
    } finally {
      setResendingId(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, [desde, hasta]);

  useEffect(() => {
    fetchCloses();
  }, [cDesde, cHasta, cView]);

  const selectPeriodo = (p) => {
    setActivePeriodo(p.key);
    setDesde(p.desde());
    setHasta(p.hasta());
  };

  const formatDateShort = (date) =>
    new Date(date).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  if (loading && activeTab === 'ventas') return <LoadingSpinner />;

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
          <IosButton variant="tinted" onClick={() => openCloseForm('manana')} className="flex-1 sm:flex-none">
            Cierre Mañana
          </IosButton>
          <IosButton variant="tinted" onClick={() => openCloseForm('tarde')} className="flex-1 sm:flex-none">
            Cierre Tarde
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
                : `Ventas del ${desde === hasta
                  ? new Date(desde).toLocaleDateString('es-AR')
                  : `${new Date(desde).toLocaleDateString('es-AR')} al ${new Date(hasta).toLocaleDateString('es-AR')}`}
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
                {data.sales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-ios-tertiary text-sm">
                      No hay ventas en este periodo
                    </td>
                  </tr>
                ) : (
                  data.sales.map((s) => {
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
                          <td className="px-4 py-3.5 text-ios-tertiary text-xs">{formatDate(s.createdAt)}</td>
                          <td className="px-5 py-3.5 text-right">
                            {user?.rol === 'admin' && (
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
                                      className="text-ios-red hover:text-ios-red/80 text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
                                    >
                                      Devolver
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setReturnIsCambio(true); setReturnSale(s); }}
                                      className="text-ios-tint hover:text-ios-tint/80 text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
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
                                      onClick={(e) => { e.stopPropagation(); printTicket(s); }}
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
            {data.sales.length === 0 ? (
              <div className="text-center py-10 text-ios-tertiary text-sm">
                No hay ventas en este periodo
              </div>
            ) : (
              data.sales.map((s) => {
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
                        {new Date(s.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · {s.empleado}
                        {s.descuento ? ` · ${s.descuento}% desc.` : ''}
                      </p>
                      <div className="flex gap-2 shrink-0">
                        {user?.rol === 'admin' && (
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
                            className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold"
                          >
                            Devolver
                          </button>
                          <button
                            onClick={() => { setReturnIsCambio(true); setReturnSale(s); }}
                            className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold"
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
                            onClick={() => printTicket(s)}
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
          {showCloseHint && (
            <div className="mb-4 flex items-start gap-3 bg-sky-500/10 border border-sky-500/25 rounded-2xl px-4 py-3.5 animate-ios-fade">
              <p className="text-sm text-sky-300 flex-1 leading-relaxed">
                <span className="font-semibold">¿Te olvidaste de cerrar un turno?</span>{' '}
                Tocá <span className="font-semibold">Cierre Mañana</span> o{' '}
                <span className="font-semibold">Cierre Tarde</span> y cambiá la fecha para cerrar un día anterior.
              </p>
              <button
                onClick={() => setShowCloseHint(false)}
                className="text-sky-400/60 hover:text-sky-300 transition-colors shrink-0"
                aria-label="Ocultar aviso"
              >
                <IconX className="w-4 h-4" strokeWidth={2} />
              </button>
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
                        <td className="px-4 py-3.5 text-ios-tertiary text-xs whitespace-nowrap">{new Date(c.cerradoAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
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
                            {!c.turnos && (
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
                            {!c.turnos && user?.rol === 'admin' && (
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
                      {new Date(c.cerradoAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
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
                      {!c.turnos && (
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
                      {!c.turnos && user?.rol === 'admin' && (
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

      <ReturnForm
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
        open={!!closeForm}
        onClose={() => setCloseForm(null)}
        title={`Cierre de ${closeForm === 'tarde' ? 'Tarde' : 'Mañana'}`}
        cancelText="Cancelar"
        confirmText={closeSaving ? 'Cerrando…' : 'Confirmar cierre'}
        onConfirm={doDailyClose}
        confirmDisabled={closeSaving}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <IosField label="Fecha del cierre" hint="¿Te olvidaste de cerrar un turno? Podés elegir la fecha y cerrar un día anterior.">
            <IosInput
              type="date"
              value={closeFecha}
              max={today()}
              onChange={(e) => setCloseFecha(e.target.value)}
            />
          </IosField>
          <IosField label="Quién cierra el turno" required>
            <IosInput
              type="text"
              value={closeNombre}
              onChange={(e) => setCloseNombre(e.target.value)}
              placeholder="Nombre del empleado"
            />
          </IosField>
        </div>
      </IosModal>
    </div>
  );
};

export default Sales;
