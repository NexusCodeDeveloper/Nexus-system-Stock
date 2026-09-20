import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { obtenerVentas as obtenerTickets } from '../../api/ventas';
import Ticket, { printTicket } from '../../components/Ticket/Ticket';
import FormularioDevolucion from '../../components/FormularioDevolucion/FormularioDevolucion';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import ScannerButton from '../../components/scanner/ScannerButton';
import ScannerModal from '../../components/scanner/ScannerModal';
import { useLector } from '../../context/LectorContext';
import { useIosAlert } from '../../components/alerts';
import { IconTicket, IconTile, IconEye, IconPrint, IconReturn, IconRefresh } from '../../components/ui/icons';
import { formatMoney, formatDate } from '../../utils/format';

const getPagos = (s) =>
  (s.pagos && s.pagos.length > 0 ? s.pagos : [{ metodo: s.metodoPago || 'efectivo', monto: s.total }]);

const getItems = (s) =>
  (s.articulos && s.articulos.length > 0 ? s.articulos : [{ producto: s.producto, cantidad: s.cantidad, precio: s.precio, talle: s.talle }]);

const pagoBadge = (metodo) => {
  if (metodo === 'efectivo') return 'bg-green-500/15 text-green-400';
  if (metodo === 'transferencia') return 'bg-blue-500/15 text-blue-400';
  return 'bg-purple-500/15 text-purple-400';
};

const pagoLabel = (metodo) =>
  metodo === 'efectivo' ? 'Efectivo' : metodo === 'transferencia' ? 'Transferencia' : 'Tarjeta';

const getNumero = (s) => (s.ticketNumero ? String(s.ticketNumero) : '—');

const getEstadoTicket = (s) => {
  if (s.estado === 'devuelta') return { label: 'Devuelto', cls: 'bg-ios-red/15 text-ios-red' };
  if ((Number(s.cantidadDevuelta) || 0) > 0) return { label: 'Devolución parcial', cls: 'bg-amber-500/15 text-amber-400' };
  return null;
};

const Tickets = () => {
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [ticketModal, setTicketModal] = useState(null);
  const [returnSale, setReturnSale] = useState(null);
  const [returnIsCambio, setReturnIsCambio] = useState(false);
  const [returnCodigo, setReturnCodigo] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dropdown, setDropdown] = useState({ sale: null, x: 0, y: 0 });
  const dropdownRef = useRef(null);
  const fetchSeqRef = useRef(0);
  const anchorRef = useRef(null);

  const { toast } = useIosAlert();

  useLayoutEffect(() => {
    if (!dropdown.sale) return;
    const menu = dropdownRef.current;
    const rect = anchorRef.current;
    if (!menu || !rect) return;
    const GAP = 8;
    const W = menu.offsetWidth;
    const H = menu.offsetHeight;
    let x = rect.left;
    let y = rect.bottom + GAP;
    if (y + H > window.innerHeight) {
      y = rect.top - GAP - H;
    }
    y = Math.max(GAP, Math.min(y, window.innerHeight - H - GAP));
    if (x + W > window.innerWidth) {
      x = rect.right - W;
    }
    x = Math.max(GAP, Math.min(x, window.innerWidth - W - GAP));
    setDropdown((prev) => ({ ...prev, x, y }));
  }, [dropdown.sale]);

  const openDropdown = (e, s) => {
    if (dropdown.sale?._id === s._id) {
      setDropdown({ sale: null, x: 0, y: 0 });
    } else {
      anchorRef.current = e.currentTarget.getBoundingClientRect();
      setDropdown({ sale: s, x: 0, y: 0 });
    }
  };

  const abrirReturn = (s, esCambio) => {
    const termino = busqueda.trim();
    setReturnCodigo(/^T-/i.test(termino) ? '' : termino);
    setReturnIsCambio(esCambio);
    setReturnSale(s);
  };

  const handleDropdownAction = async (action) => {
    const s = dropdown.sale;
    setDropdown({ sale: null, x: 0, y: 0 });
    if (!s) return;
    if (action === 'ver') setTicketModal(s);
    else if (action === 'imprimir') {
      const ok = await printTicket(s);
      if (!ok) toast({ message: 'Habilitá las ventanas emergentes para imprimir' });
    }
    else if (action === 'devolver' && s.estado !== 'devuelta') abrirReturn(s, false);
    else if (action === 'cambiar' && s.estado !== 'devuelta') abrirReturn(s, true);
  };

  const fetchData = () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFetchError('');
    const params = { offset: new Date().getTimezoneOffset() };
    const termino = busqueda.trim();
    if (termino) params.buscar = termino;
    obtenerTickets(params)
      .then((res) => {
        if (seq !== fetchSeqRef.current) return;
        const ventas = res.data?.ventas;
        setData(Array.isArray(ventas) ? ventas : []);
      })
      .catch((err) => {
        if (seq !== fetchSeqRef.current) return;
        setFetchError(obtenerMensajeErrorApi(err, 'Error al cargar tickets'));
      })
      .finally(() => {
        if (seq === fetchSeqRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      fetchData();
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  useLector((codigo) => {
    setBusqueda(String(codigo).trim());
  }, !ticketModal && !returnSale);

  return (
    <div>
      {fetchError && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {fetchError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-ios-label tracking-tight">Tickets emitidos</h2>
          <p className="text-sm text-ios-tertiary mt-0.5">
            {data.length} ticket{data.length === 1 ? '' : 's'} emitido{data.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5 mb-4 flex items-center gap-3">
        <IosSearch
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por ticket o código de producto…"
          className="flex-1"
        />
        <ScannerButton onClick={() => setScannerOpen(true)} title="Escanear ticket o producto" />
      </div>

      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onLeer={(codigo) => {
          setBusqueda(String(codigo).trim());
          setScannerOpen(false);
        }}
        titulo="Escanear ticket o producto"
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="hidden md:block bg-ios-surface border border-ios-separator/30 rounded-3xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Ticket Nº</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Productos</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Total</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Empleado</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Pago</th>
                  <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Fecha</th>
                  <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-ios-tertiary text-sm">
                      No se encontraron tickets{busqueda.trim() ? ' con ese criterio' : ''}
                    </td>
                  </tr>
                ) : (
                  data.map((s) => {
                    const items = getItems(s);
                    return (
                      <tr
                        key={s._id}
                        className="border-t border-ios-separator/30 hover:bg-ios-hover/[0.03] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-ios-label tabular-nums tracking-wide">{getNumero(s)}</span>
                            {getEstadoTicket(s) && (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getEstadoTicket(s).cls}`}>
                                {getEstadoTicket(s).label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-ios-secondary">
                          {items[0]?.producto?.nombre || 'Producto'}
                          {items.length > 1 && <span className="text-ios-tertiary"> +{items.length - 1} más</span>}
                          {items[0]?.producto?.codigo && (
                            <span className="block text-[11px] text-ios-tertiary mt-0.5">Cód. {items[0].producto.codigo}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-ios-green font-semibold whitespace-nowrap tabular-nums">{formatMoney(s.total)}</td>
                        <td className="px-4 py-3.5 text-ios-secondary">{s.empleado}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {getPagos(s).map((p, i) => (
                              <span key={i} className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${pagoBadge(p.metodo)}`}>
                                {pagoLabel(p.metodo)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-ios-tertiary text-xs">{formatDate(s.fechaCreacion)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={(e) => openDropdown(e, s)}
                            className="p-2 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
                            aria-label="Opciones del ticket"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {data.length === 0 ? (
              <div className="text-center py-10 text-ios-tertiary text-sm">
                No se encontraron tickets{busqueda.trim() ? ' con ese criterio' : ''}
              </div>
            ) : (
              data.map((s) => {
                const items = getItems(s);
                const isExpanded = expandedId === s._id;
                return (
                  <div key={s._id} className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-4 shadow-ios-card">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <IconTile gradient="from-amber-500 to-orange-600" className="w-8 h-8">
                          <IconTicket className="w-4 h-4 text-white" strokeWidth={2} />
                        </IconTile>
                        <p className="font-bold text-ios-label tabular-nums tracking-wide text-[15px]">{getNumero(s)}</p>
                        {getEstadoTicket(s) && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getEstadoTicket(s).cls}`}>
                            {getEstadoTicket(s).label}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end shrink-0">
                        {getPagos(s).map((p, i) => (
                          <span key={i} className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${pagoBadge(p.metodo)}`}>
                            {pagoLabel(p.metodo)}
                          </span>
                        ))}
                        <button
                          onClick={(e) => openDropdown(e, s)}
                          className="p-1.5 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
                          aria-label="Opciones del ticket"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[22px] font-bold text-ios-green break-words min-w-0">{formatMoney(s.total)}</p>
                      <p className="text-xs text-ios-tertiary shrink-0">
                        {items[0]?.producto?.nombre || 'Producto'}
                        {items.length > 1 && ` +${items.length - 1} más`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-ios-separator/40">
                      <p className="text-xs text-ios-tertiary truncate min-w-0 flex-1">
                        {formatDate(s.fechaCreacion)} · {s.empleado}
                      </p>
                      {isExpanded ? (
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold shrink-0"
                        >
                          Ocultar detalle
                        </button>
                      ) : (
                        <button
                          onClick={() => setExpandedId(s._id)}
                          className="text-ios-tint text-xs border border-ios-tint/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-tint/10 transition-all font-semibold shrink-0"
                        >
                          Ver detalle
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-ios-separator/40 space-y-2.5">
                        {(Number(s.cantidadDevuelta) || 0) > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-xs text-ios-tertiary">Devuelto</span>
                            <span className="text-amber-400 font-semibold text-xs">
                              {formatMoney(s.montoDevuelto)} ({s.cantidadDevuelta} unid.)
                            </span>
                          </div>
                        )}
                        {items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-ios-label font-medium truncate">{item.producto?.nombre || 'Producto'}</p>
                              <p className="text-xs text-ios-tertiary">
                                {item.producto?.codigo ? `Cód. ${item.producto.codigo} · ` : ''}
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
      )}

      {dropdown.sale && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setDropdown({ sale: null, x: 0, y: 0 })} />
          <div
            ref={dropdownRef}
            className="fixed z-40 w-48 bg-ios-surface/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-ios-alert p-1.5 animate-ios-modal"
            style={{ left: dropdown.x, top: dropdown.y }}
          >
            <button
              onClick={() => handleDropdownAction('ver')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-tint hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconEye className="w-4 h-4" />
              Ver ticket
            </button>
            <button
              onClick={() => handleDropdownAction('imprimir')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-tint hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconPrint className="w-4 h-4" />
              Imprimir
            </button>
            <button
              onClick={() => handleDropdownAction('devolver')}
              disabled={dropdown.sale?.estado === 'devuelta'}
              className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm rounded-xl transition-colors font-medium ${
                dropdown.sale?.estado === 'devuelta'
                  ? 'text-ios-red/40 cursor-not-allowed'
                  : 'text-ios-red hover:bg-ios-hover/5'
              }`}
            >
              <IconReturn className="w-4 h-4" />
              Devolver
            </button>
            <button
              onClick={() => handleDropdownAction('cambiar')}
              disabled={dropdown.sale?.estado === 'devuelta'}
              className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm rounded-xl transition-colors font-medium ${
                dropdown.sale?.estado === 'devuelta'
                  ? 'text-ios-purple/40 cursor-not-allowed'
                  : 'text-ios-purple hover:bg-ios-hover/5'
              }`}
            >
              <IconRefresh className="w-4 h-4" />
              Cambiar
            </button>
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
        initialCodigo={returnCodigo}
        onClose={() => {
          setReturnSale(null);
          setReturnCodigo('');
        }}
        onDone={() => {
          fetchData();
          setTicketModal(null);
        }}
      />
    </div>
  );
};

export default Tickets;
