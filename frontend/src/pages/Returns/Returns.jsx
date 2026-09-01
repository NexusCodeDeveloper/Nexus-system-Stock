import { useState, useEffect } from 'react';
import { getReturns, deleteReturn } from '../../api/returns';
import { getApiErrorMessage } from '../../utils/apiError';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useIosAlert } from '../../components/alerts';
import { IconReturn } from '../../components/ui/icons';

const Returns = () => {
  const { user } = useAuth();
  const { confirm, toast, show: alert } = useIosAlert();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = async () => {
    setError('');
    try {
      const res = await getReturns();
      setReturns(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar devoluciones'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar esta devolución?',
      message: 'El stock del producto se ajustará automáticamente',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteReturn(id);
      fetchReturns();
      toast({ message: 'Devolución eliminada' });
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: getApiErrorMessage(err, 'Error al eliminar devolución'),
      });
    }
  };

  const formatDate = (date) =>
    new Date(date).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatMoney = (n) =>
    `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1 className="text-[28px] font-bold text-ios-label tracking-tight mb-6">Historial de Devoluciones</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {returns.length === 0 ? (
        <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
          <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
            <IconReturn className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
          </div>
          <p className="text-ios-tertiary text-sm">No hay devoluciones registradas</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-hidden shadow-ios-card">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Producto</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Categoría</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Cantidad</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Talle</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Motivo</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Ticket</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Diferencia</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Fecha</th>
                  <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r._id} className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-ios-label">{r.producto?.nombre}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{r.producto?.categoria || '—'}</td>
                    <td className="px-4 py-3.5 text-ios-label">{r.cantidad}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{r.talle || '—'}</td>
                    <td className="px-4 py-3.5 text-ios-secondary">{r.motivo}</td>
                    <td className="px-4 py-3.5">
                      {r.sale?.ticketNumero ? (
                        <span className="text-ios-label font-semibold tabular-nums">{r.sale.ticketNumero}</span>
                      ) : (
                        <span className="text-ios-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {r.diferencia !== 0 ? (
                        <span className={`font-semibold whitespace-nowrap tabular-nums ${r.diferencia > 0 ? 'text-ios-green' : 'text-amber-400'}`}>
                          {r.diferencia > 0 ? `+${formatMoney(r.diferencia)}` : `-${formatMoney(Math.abs(r.diferencia))}`}
                        </span>
                      ) : (
                        <span className="text-ios-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ios-tertiary text-xs">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {user?.rol === 'admin' && (
                        <button
                          onClick={() => handleDelete(r._id)}
                          className="text-ios-red hover:text-ios-red/80 font-medium text-sm"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {returns.map((r) => (
              <div key={r._id} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ios-label">{r.producto?.nombre}</p>
                      <p className="text-xs text-ios-tertiary mt-0.5">
                        {r.producto?.categoria || '—'}
                        {r.talle ? ` · Talle ${r.talle}` : ''}
                      </p>
                    </div>
                    {user?.rol === 'admin' && (
                      <button
                        onClick={() => handleDelete(r._id)}
                        className="text-ios-red text-xs border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-all font-semibold shrink-0"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {r.diferencia !== 0 && (
                    <div className={`mt-2 inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      r.diferencia > 0
                        ? 'bg-green-500/10 border-green-500/25 text-green-400'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                    }`}>
                      {r.diferencia > 0
                        ? `Pagó diferencia: ${formatMoney(r.diferencia)}`
                        : `A favor del cliente: ${formatMoney(Math.abs(r.diferencia))}`}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-ios-separator/40 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-ios-tertiary text-xs">Cantidad</span>
                      <span className="text-ios-secondary">{r.cantidad}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ios-tertiary text-xs">Ticket</span>
                      <span className="text-ios-label font-semibold tabular-nums text-xs">{r.sale?.ticketNumero || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ios-tertiary text-xs">Motivo</span>
                      <span className="text-ios-secondary text-right">{r.motivo}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ios-tertiary text-xs">Fecha</span>
                      <span className="text-ios-secondary text-xs">{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Returns;