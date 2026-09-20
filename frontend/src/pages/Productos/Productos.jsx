import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  obtenerProductos,
  obtenerProductoPorCodigo,
  eliminarProducto,
  retirarStock,
  obtenerStockBajo,
} from '../../api/productos';
import { obtenerVentas as obtenerTickets } from '../../api/ventas';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { formatMoney, formatDate } from '../../utils/format';
import { escucharPush } from '../../services/GestorPush';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ScannerButton from '../../components/scanner/ScannerButton';
import ScannerModal from '../../components/scanner/ScannerModal';
import FormularioDevolucion from '../../components/FormularioDevolucion/FormularioDevolucion';
import { useAutenticacion } from '../../context/AutenticacionContext';
import { useLector } from '../../context/LectorContext';
import { useCarrito } from '../../context/CarritoContext';
import { useCaja } from '../../context/CajaContext';
import { useIosAlert, IconAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import IosToggle from '../../components/ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../../components/ui/IosForm';
import { IconCart, IconArrowUp, IconChevronDown, IconTrash, IconX, IconBox, IconCamera, IconReturn, IconRefresh } from '../../components/ui/icons';

const variantLabel = (v) => {
  const parts = [];
  if (v.talle) parts.push(v.talle);
  if (v.color) parts.push(v.color);
  const label = parts.join(' / ') || 'Sin variante';
  return `${label} (${v.cantidad})`;
};

const variantShortLabel = (v) => {
  const parts = [];
  if (v.talle) parts.push(v.talle);
  if (v.color) parts.push(v.color);
  return parts.join(' / ') || '—';
};

const depositoTotal = (p) =>
  p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (v.deposito || 0), 0) : (p.deposito || 0);

const Productos = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dropdown, setDropdown] = useState({ product: null, x: 0, y: 0 });
  const dropdownRef = useRef(null);
  const anchorRef = useRef(null);
  const fetchSeqRef = useRef(0);
  const returnSeqRef = useRef(0);
  const lowStockSeqRef = useRef(0);

  useLayoutEffect(() => {
    if (!dropdown.product) return;
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
  }, [dropdown.product]);

  const [error, setError] = useState('');
  const [returnPicker, setReturnPicker] = useState(null);
  const [returnTickets, setReturnTickets] = useState([]);
  const [returnTicketsLoading, setReturnTicketsLoading] = useState(false);
  const [returnTicketsError, setReturnTicketsError] = useState('');
  const [returnEsCambio, setReturnEsCambio] = useState(false);
  const [returnSale, setReturnSale] = useState(null);
  const [returnCodigo, setReturnCodigo] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerContinuo, setScannerContinuo] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null);
  const [qaCantidad, setQaCantidad] = useState('1');
  const [qaVariantIdx, setQaVariantIdx] = useState('');

  const [retirarModal, setRetirarModal] = useState(null);
  const [retirarCantidad, setRetirarCantidad] = useState('1');
  const [retirarVariantIdx, setRetirarVariantIdx] = useState('');
  const [retirarSaving, setRetirarSaving] = useState(false);

  const { usuario } = useAutenticacion();
  const { show: alert, confirm, toast } = useIosAlert();
  const {
    cart,
    addItem,
    removeFromCart,
    updateCartItem,
    showCartModal,
    openCart,
    closeCart,
    metodos,
    sellEmpleado,
    sellDescuento,
    setSellDescuento,
    sellMetodoPago,
    setMetodoPago,
    sellSplit,
    toggleSplit,
    sellMetodo2,
    setSellMetodo2,
    sellMonto2,
    setSellMonto2,
    sellSaving,
    descuentoNum,
    finalTotal,
    sellMonto1,
    confirmSale,
    saleVersion,
  } = useCarrito();
  const { caja, cierreHoy, esDeHoy, openAbrir, openReabrir } = useCaja();

  const [lowStock, setLowStock] = useState([]);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [lowStockError, setLowStockError] = useState('');

  const [expandedId, setExpandedId] = useState(null);

  const agotados = lowStock.filter((i) => i.cantidad === 0);
  const bajos = lowStock.filter((i) => i.cantidad > 0);

  const fetchData = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const prodRes = await obtenerProductos({ search });
      if (seq !== fetchSeqRef.current) return;
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(obtenerMensajeErrorApi(err, 'Error al cargar productos'));
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  };

  const fetchLowStock = () => {
    const seq = ++lowStockSeqRef.current;
    setLowStockError('');
    obtenerStockBajo()
      .then((res) => {
        if (seq !== lowStockSeqRef.current) return;
        setLowStock(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (seq !== lowStockSeqRef.current) return;
        setLowStockError(obtenerMensajeErrorApi(err, 'Error al cargar stock bajo'));
      });
  };

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchLowStock();
  }, []);

  useEffect(() => {
    const off = escucharPush((payload) => {
      if (['stock', 'venta', 'devolucion'].includes(payload?.tipo)) {
        fetchLowStock();
        fetchDataRef.current();
      }
    });
    return off;
  }, []);

  const saleVersionRef = useRef(saleVersion);
  useEffect(() => {
    if (saleVersion === saleVersionRef.current) return;
    saleVersionRef.current = saleVersion;
    fetchData();
    fetchLowStock();
  }, [saleVersion]);

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este producto?',
      message: 'Esta acción no se puede deshacer',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarProducto(id);
      fetchData();
      fetchLowStock();
      toast({ message: 'Producto eliminado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar producto') });
    }
  };

  const openQuickAdd = (product) => {
    setQuickAdd(product);
    setQaCantidad('1');
    setQaVariantIdx('');
  };

  const confirmQuickAdd = () => {
    if (!quickAdd) return;
    const cantidad = Number(qaCantidad);
    if (cantidad < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida' });
      return;
    }
    if (quickAdd.variantes?.length > 0 && qaVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar una variante' });
      return;
    }
    const variant = quickAdd.variantes?.[Number(qaVariantIdx)];
    const stockDisponible = variant ? variant.cantidad : quickAdd.cantidad;
    const talle = variant?.talle || '';
    const color = variant?.color || '';
    const enCarrito = cart.find(
      (i) => i.producto === quickAdd._id && i.talle === talle && i.color === color
    );
    if (Number(enCarrito?.cantidad || 0) + cantidad > stockDisponible) {
      alert({ icon: 'warning', title: 'Stock insuficiente', message: `Solo hay ${stockDisponible} unidad(es) disponible(s)` });
      return;
    }
    addItem({
      producto: quickAdd._id,
      nombre: quickAdd.nombre,
      precio: quickAdd.precio,
      cantidad,
      talle,
      color,
    });
    setQuickAdd(null);
    toast({ message: 'Agregado al carrito', duration: 1400 });
  };

  const openRetirar = (product) => {
    setRetirarModal(product);
    setRetirarCantidad('1');
    setRetirarVariantIdx(product?.variantes?.length === 1 ? '0' : '');
  };

  const retirarVariants = retirarModal?.variantes || [];
  const retirarVariant = retirarVariants[Number(retirarVariantIdx)] || null;
  const retirarDisponible = retirarVariants.length > 0
    ? (retirarVariant ? (retirarVariant.cantidad || 0) : null)
    : (retirarModal?.cantidad || 0);

  const confirmRetirar = async () => {
    if (!retirarModal || retirarSaving) return;
    if (retirarVariants.length > 0 && retirarVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar una variante' });
      return;
    }
    const cantidad = Number(retirarCantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe ingresar al menos 1 unidad' });
      return;
    }
    if (retirarDisponible != null && cantidad > retirarDisponible) {
      alert({ icon: 'warning', title: 'Stock insuficiente', message: `Solo hay ${retirarDisponible} unidad(es) en salón` });
      return;
    }
    setRetirarSaving(true);
    try {
      await retirarStock(retirarModal._id, { cantidad, talle: retirarVariant?.talle || '', color: retirarVariant?.color || '' });
      setRetirarModal(null);
      fetchData();
      fetchLowStock();
      toast({ message: 'Retirado al depósito' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al retirar stock') });
    } finally {
      setRetirarSaving(false);
    }
  };

  const openReturn = (product, esCambio) => {
    if (!product?.codigo) {
      alert({
        icon: 'warning',
        title: 'Producto sin código',
        message: 'Este producto no tiene código interno, no se pueden buscar sus tickets con seguridad. Usá la sección Tickets para devolverlo.',
      });
      return;
    }
    setReturnPicker({ producto: product, esCambio });
    setReturnTickets([]);
    setReturnTicketsError('');
    setReturnTicketsLoading(true);
    const seq = ++returnSeqRef.current;
    obtenerTickets({ codigo: product.codigo, offset: new Date().getTimezoneOffset() })
      .then((res) => {
        if (seq !== returnSeqRef.current) return;
        const ventas = res.data?.ventas;
        setReturnTickets(Array.isArray(ventas) ? ventas.filter((s) => s.estado !== 'devuelta') : []);
      })
      .catch((err) => {
        if (seq !== returnSeqRef.current) return;
        setReturnTicketsError(obtenerMensajeErrorApi(err, 'Error al buscar tickets'));
      })
      .finally(() => {
        if (seq === returnSeqRef.current) setReturnTicketsLoading(false);
      });
  };

  const elegirTicket = (sale) => {
    setReturnEsCambio(!!returnPicker?.esCambio);
    setReturnCodigo(returnPicker?.producto?.codigo || '');
    setReturnSale(sale);
    setReturnPicker(null);
  };

  const agregarAlCarritoEscaneado = (producto) => {
    if (producto.variantes?.length > 0) {
      setScannerOpen(false);
      openQuickAdd(producto);
      return;
    }
    const stock = Number(producto.cantidad) || 0;
    if (stock < 1) {
      alert({ icon: 'warning', title: 'Sin stock', message: `${producto.nombre} no tiene unidades disponibles` });
      return;
    }
    const actual = cart.find((i) => i.producto === producto._id && !i.talle && !i.color);
    if (Number(actual?.cantidad || 0) + 1 > stock) {
      alert({ icon: 'warning', title: 'Stock insuficiente', message: `Solo hay ${stock} unidad(es) de ${producto.nombre}` });
      return;
    }
    addItem({
      producto: producto._id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1,
      talle: '',
      color: '',
    });
    toast({ message: `Agregado: ${producto.nombre}`, duration: 1400 });
  };

  const manejarCodigoEscaneado = async (codigo) => {
    try {
      const { data: producto } = await obtenerProductoPorCodigo(codigo);
      setSearch('');
      if (cart.length > 0) {
        agregarAlCarritoEscaneado(producto);
        return;
      }
      openQuickAdd(producto);
    } catch (err) {
      if (err.response?.status === 404) {
        if (usuario?.rol !== 'admin') {
          toast({
            message: `No existe un producto con el código "${codigo}". Comunicate con el dueño del negocio para que lo cargue al depósito.`,
            duration: 3200,
          });
          return;
        }
        const crear = await confirm({
          icon: 'info',
          title: 'Código no encontrado',
          message: `No existe un producto con el código "${codigo}". ¿Querés crearlo en el depósito?`,
          confirmText: 'Ir a Depósito',
        });
        if (crear) {
          navigate('/deposito', { state: { crear: true } });
        }
        return;
      }
      toast({ message: obtenerMensajeErrorApi(err, 'Error al buscar el código') });
    }
  };

  useLector(manejarCodigoEscaneado, !returnPicker && !returnSale && !retirarModal && !quickAdd);

  const renderVariantSelect = (variants, value, onChange, label = 'Variante') => {
    if (!variants?.length) return null;
    return (
      <IosField label={label} required>
        <IosSelect value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" className="bg-ios-surface2">Seleccionar...</option>
          {variants.map((v, i) => (
            <option key={i} value={String(i)} className="bg-ios-surface2">{variantLabel(v)}</option>
          ))}
        </IosSelect>
      </IosField>
    );
  };

  const handleDropdownAction = async (action) => {
    const p = dropdown.product;
    setDropdown({ product: null, x: 0, y: 0 });
    if (action === 'carrito') openQuickAdd(p);
    else if (action === 'retirar') openRetirar(p);
    else if (action === 'devolver') openReturn(p, false);
    else if (action === 'cambiar') openReturn(p, true);
    else if (action === 'eliminar') handleDelete(p._id);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Productos</h1>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <IosButton variant="tinted" onClick={openCart} className="md:hidden flex-1 sm:flex-none relative">
            <IconCart className="w-[18px] h-[18px]" />
            Carrito
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-ios-tint text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-[0_2px_6px_rgba(10,132,255,0.5)]">
                {cart.length}
              </span>
            )}
          </IosButton>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <IosSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, categoría o código..."
          className="w-full md:w-96"
        />
        <ScannerButton
          onClick={() => {
            setScannerContinuo(false);
            setScannerOpen(true);
          }}
          title="Escanear producto"
        />
        {lowStockError && (
          <span className="text-xs text-ios-tertiary" title={lowStockError}>Alerta de stock no disponible</span>
        )}
        {lowStock.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setLowStockOpen(!lowStockOpen)}
              className="ios-btn-press flex items-center gap-2 px-3.5 py-2 bg-ios-red/10 border border-ios-red/25 rounded-ios-pill text-sm text-ios-red font-semibold hover:bg-ios-red/15 transition-all"
            >
              <IconAlert className="w-4 h-4 shrink-0" strokeWidth={1.9} />
              <span className="text-xs font-semibold whitespace-nowrap">
                {bajos.length > 0 && `${bajos.length} bajo`}
                {bajos.length > 0 && agotados.length > 0 && ' · '}
                {agotados.length > 0 && `${agotados.length} agotado${agotados.length > 1 ? 's' : ''}`}
              </span>
            </button>
            {lowStockOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setLowStockOpen(false)} />
                <div
                  role="dialog"
                  aria-label="Detalle de stock bajo y agotados"
                  className="absolute left-0 md:left-auto md:right-0 top-full mt-2 z-40 w-[26rem] max-w-[calc(100vw-2rem)] bg-ios-surface/95 backdrop-blur-2xl border border-ios-separator/40 rounded-2xl shadow-ios-alert p-3 animate-ios-modal max-h-[70vh] overflow-y-auto"
                >
                  {bajos.length > 0 && (
                    <p className="px-3 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ios-orange">
                      Stock bajo ({bajos.length})
                    </p>
                  )}
                  {bajos.map((item, i) => (
                    <div
                      key={`bajo-${item.productoId}-${item.talle || ''}-${item.color || ''}-${i}`}
                      className="flex items-start gap-2.5 px-3 py-3 rounded-xl hover:bg-ios-hover/[0.04] transition-colors"
                    >
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-ios-orange shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ios-label break-words">{item.productoNombre}</p>
                        {(item.talle || item.color) && (
                          <p className="text-xs text-ios-tertiary mt-0.5">
                            {[item.talle, item.color].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ios-orange/15 text-ios-orange whitespace-nowrap">
                          Quedan {item.cantidad}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                            item.deposito > 0 ? 'bg-ios-surface2 text-ios-tertiary' : 'bg-ios-surface2/60 text-ios-tertiary opacity-60'
                          }`}
                        >
                          Dep: {item.deposito}
                        </span>
                      </div>
                    </div>
                  ))}

                  {agotados.length > 0 && (
                    <p className={`px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ios-red ${bajos.length > 0 ? 'pt-3' : 'pt-1'}`}>
                      Agotados ({agotados.length})
                    </p>
                  )}
                  {agotados.map((item, i) => (
                    <div
                      key={`agotado-${item.productoId}-${item.talle || ''}-${item.color || ''}-${i}`}
                      className="flex items-start gap-2.5 px-3 py-3 rounded-xl hover:bg-ios-hover/[0.04] transition-colors"
                    >
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-ios-red shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ios-label break-words">{item.productoNombre}</p>
                        {(item.talle || item.color) && (
                          <p className="text-xs text-ios-tertiary mt-0.5">
                            {[item.talle, item.color].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ios-red/15 text-ios-red whitespace-nowrap">
                          AGOTADO
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                            item.deposito > 0 ? 'bg-ios-surface2 text-ios-tertiary' : 'bg-ios-surface2/60 text-ios-tertiary opacity-60'
                          }`}
                        >
                          Dep: {item.deposito}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <IosModal
        open={!!quickAdd}
        onClose={() => setQuickAdd(null)}
        title="Agregar al carrito"
        confirmText="Agregar"
        cancelText="Cancelar"
        onConfirm={confirmQuickAdd}
      >
        <p className="text-ios-secondary text-sm mb-4 font-medium">{quickAdd?.nombre}</p>
        <div className="space-y-4">
          <IosField label="Cantidad">
            <IosInput
              type="text" inputMode="numeric"
              value={qaCantidad}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+$/.test(v)) setQaCantidad(v);
              }}
            />
          </IosField>
          <IosField label="Precio unitario">
            <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-label text-sm font-medium">
              {formatMoney(quickAdd?.precio)}
            </div>
          </IosField>
          {renderVariantSelect(quickAdd?.variantes, qaVariantIdx, setQaVariantIdx)}
        </div>
      </IosModal>

      <div className="md:hidden">
        <IosModal
          open={showCartModal}
          onClose={closeCart}
          title={`Carrito (${cart.length} productos)`}
          cancelText="Seguir comprando"
          confirmText="Confirmar Venta"
          confirmVariant="tinted"
          onConfirm={confirmSale}
          confirmDisabled={sellSaving || !caja || !esDeHoy}
          maxWidth="max-w-2xl"
        >
        {!caja && cierreHoy && (
          <div className="mb-3 rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            La caja está cerrada.
            {usuario?.rol === 'admin' ? (
              <button
                type="button"
                onClick={openReabrir}
                className="mt-2 w-full py-2 rounded-ios-control bg-amber-500/20 font-bold hover:bg-amber-500/30 transition-colors"
              >
                Reabrir caja
              </button>
            ) : (
              <p className="mt-1 text-amber-200/80">Solo el administrador puede reabrirla.</p>
            )}
          </div>
        )}
        {!caja && !cierreHoy && (
          <div className="mb-3 rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            La caja está cerrada. Abrila para poder vender.
            <button
              type="button"
              onClick={openAbrir}
              className="mt-2 w-full py-2 rounded-ios-control bg-amber-500/20 font-bold hover:bg-amber-500/30 transition-colors"
            >
              Abrir caja
            </button>
          </div>
        )}
        {caja && !esDeHoy && (
          <div className="mb-3 rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            La caja abierta es del {new Date(caja.fecha).toLocaleDateString('es-AR')}. Cerrála desde Ventas para poder vender.
          </div>
        )}
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-ios-tertiary">
            Escaneá productos para agregarlos al carrito
          </p>
          <button
            type="button"
            onClick={() => {
              setScannerContinuo(true);
              setScannerOpen(true);
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-control bg-ios-surface2 text-ios-secondary text-xs font-medium hover:bg-ios-surface3 transition-colors"
          >
            <IconCamera className="w-3.5 h-3.5" />
            Escanear
          </button>
        </div>
        <div className="space-y-2 mb-4">
          {cart.map((item, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-ios-surface rounded-2xl p-3 border border-ios-separator/30">
              <div className="flex-1 min-w-0 flex items-start justify-between gap-2 sm:block">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ios-label truncate">{item.nombre}</p>
                  {(item.talle || item.color) && (
                    <p className="text-xs text-ios-tertiary mt-0.5">
                      {item.talle && <span className="text-ios-secondary">Talle: {item.talle}</span>}
                      {item.talle && item.color && <span className="text-ios-tertiary"> | </span>}
                      {item.color && <span className="text-ios-secondary">Color: {item.color}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeFromCart(idx)}
                  className="text-ios-red p-1 sm:hidden shrink-0"
                >
                  <IconX className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto shrink-0 w-full sm:w-auto">
                <input
                  type="text" inputMode="numeric"
                  value={item.cantidad}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) updateCartItem(idx, 'cantidad', v);
                  }}
                  className="w-16 px-2 py-1.5 text-center bg-ios-surface2 rounded-lg text-ios-label text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-ios-tertiary">×</span>
                <span className="w-24 px-2 py-1.5 text-right text-ios-label text-sm font-medium">
                  {formatMoney(item.precio)}
                </span>
                <span className="text-ios-tertiary text-xs font-medium w-20 text-right">
                  {formatMoney(item.precio * (Number(item.cantidad) || 0))}
                </span>
                <button
                  onClick={() => removeFromCart(idx)}
                  className="text-ios-red p-1 hidden sm:block"
                >
                  <IconTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ios-separator/40 pt-4 space-y-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <IosField label="Empleado">
              <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-secondary text-sm truncate">
                {sellEmpleado || '—'}
              </div>
            </IosField>
            <IosField label="Descuento">
              <IosInput
                type="text" inputMode="numeric"
                value={sellDescuento}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100)) setSellDescuento(v);
                }}
                placeholder="% (0-100)"
              />
            </IosField>
          </div>

          <div className="bg-ios-surface rounded-2xl border border-ios-separator/30 p-4 space-y-3">
            <p className="text-[13px] text-ios-secondary font-medium">Pago</p>
            <div className="flex gap-2">
              {metodos.map((m) => (
                <button
                  key={m.key} type="button"
                  onClick={() => setMetodoPago(m.key)}
                  className={`flex-1 px-3 py-2 text-sm rounded-ios-control border transition-all ios-btn-press font-medium ${
                    sellMetodoPago === m.key
                      ? m.activeCls
                      : 'bg-ios-surface2 text-ios-tertiary border-transparent hover:bg-ios-surface3'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <IosToggle checked={sellSplit} onChange={toggleSplit} />
                <span className="text-sm text-ios-secondary font-medium">Dividir pago</span>
              </label>
              <span className="text-sm text-ios-tertiary">
                Monto: <span className="text-ios-label font-semibold">{formatMoney(sellMonto1)}</span>
              </span>
            </div>
            {sellSplit && (
              <div className="space-y-2 pt-3 border-t border-ios-separator/40">
                <div className="flex items-center justify-between px-3 py-2 bg-ios-tint/10 rounded-ios-control">
                  <span className="text-sm font-semibold text-ios-tint">{metodos.find((m) => m.key === sellMetodoPago)?.label}</span>
                  <span className="text-sm text-ios-label font-mono">{formatMoney(sellMonto1)}</span>
                </div>
                <div className="flex gap-3 items-center">
                  <IosSelect value={sellMetodo2} onChange={(e) => setSellMetodo2(e.target.value)} className="flex-1">
                    {metodos.filter((m) => m.key !== sellMetodoPago).map((m) => (
                      <option key={m.key} value={m.key} className="bg-ios-surface2">{m.label}</option>
                    ))}
                  </IosSelect>
                  <span className="text-sm text-ios-tertiary font-mono">$</span>
                  <input
                    type="text" inputMode="numeric"
                    value={sellMonto2}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setSellMonto2(v);
                    }}
                    className="w-24 sm:w-28 px-3 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-label text-sm text-right focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-ios-separator/40 pt-4">
          <div className="text-sm text-center sm:text-left">
            {descuentoNum > 0 && (
              <span className="text-ios-green/90 mr-3 font-medium">Desc. {descuentoNum}%</span>
            )}
            <span className="text-ios-secondary font-semibold">Total: <span className="text-ios-label text-lg font-bold">{formatMoney(finalTotal)}</span></span>
          </div>
        </div>
      </IosModal>
      </div>

      <ScannerModal
        open={scannerOpen}
        continuo={scannerContinuo}
        onClose={() => setScannerOpen(false)}
        onLeer={manejarCodigoEscaneado}
        titulo={scannerContinuo ? 'Escanear para agregar al carrito' : 'Escanear producto'}
      />

      <IosModal
        open={!!retirarModal}
        onClose={() => setRetirarModal(null)}
        title="Retirar a depósito"
        cancelText="Cancelar"
        confirmText="Retirar"
        confirmVariant="tinted"
        onConfirm={confirmRetirar}
      >
        <p className="text-ios-secondary text-sm mb-1">
          <span className="text-ios-label font-semibold">{retirarModal?.nombre}</span>
        </p>
        <p className="text-xs text-ios-tertiary mb-4">
          En salón: <span className="text-ios-label font-semibold">{retirarDisponible ?? '—'}</span>
          {' · '}En depósito:{' '}
          <span className="text-ios-label font-semibold">
            {retirarVariants.length > 0 ? (retirarVariant?.deposito ?? '—') : (retirarModal?.deposito ?? 0)}
          </span>
        </p>
        <div className="space-y-4">
          {renderVariantSelect(retirarVariants, retirarVariantIdx, setRetirarVariantIdx)}
          <IosField label="Unidades a retirar" hint={`Disponible en salón: ${retirarDisponible ?? '—'}`}>
            <IosInput
              type="text" inputMode="numeric"
              value={retirarCantidad}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+$/.test(v)) setRetirarCantidad(v);
              }}
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={!!returnPicker}
        onClose={() => setReturnPicker(null)}
        title="Elegir ticket"
        cancelText="Cancelar"
        showClose
        maxWidth="max-w-lg"
      >
        <p className="text-ios-secondary text-sm mb-4">
          <span className="text-ios-label font-semibold">{returnPicker?.producto?.nombre}</span>
          {' — '}
          {returnPicker?.esCambio
            ? 'elegí el ticket de la venta para hacer el cambio.'
            : 'elegí el ticket de la venta para registrar la devolución.'}
        </p>

        {returnTicketsLoading ? (
          <LoadingSpinner />
        ) : returnTicketsError ? (
          <div className="px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
            {returnTicketsError}
          </div>
        ) : returnTickets.length === 0 ? (
          <p className="text-ios-tertiary text-sm py-6 text-center">
            No hay tickets activos con este producto. Buscalo desde la página Tickets.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {returnTickets.map((s) => (
              <button
                key={s._id}
                onClick={() => elegirTicket(s)}
                className="w-full text-left px-4 py-3 rounded-2xl border border-ios-separator/40 hover:bg-ios-hover/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ios-label tabular-nums tracking-wide">{s.ticketNumero || '—'}</span>
                  <span className="text-ios-green font-semibold tabular-nums">{formatMoney(s.total)}</span>
                </div>
                <div className="text-xs text-ios-tertiary mt-0.5">
                  {formatDate(s.fechaCreacion)} · {s.empleado || '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </IosModal>

      <FormularioDevolucion
        sale={returnSale}
        open={!!returnSale}
        defaultExchange={returnEsCambio}
        initialCodigo={returnCodigo}
        onClose={() => {
          setReturnSale(null);
          setReturnCodigo('');
          setReturnEsCambio(false);
        }}
        onDone={() => {
          fetchData();
          fetchLowStock();
        }}
      />


      {error && (
        <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="hidden md:block bg-ios-surface rounded-3xl overflow-hidden shadow-ios-card border border-ios-separator/30">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Nombre</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Detalle</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Precio</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Total</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Categoría</th>
                <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Proveedor</th>
                <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-ios-tertiary text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <IconBox className="w-8 h-8 text-ios-tertiary" strokeWidth={1.5} />
                      {error || 'No hay productos'}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p, i) => (
                  <tr
                    key={p._id}
                    className="border-t border-ios-separator/30 transition-colors hover:bg-ios-hover/[0.03] cursor-pointer animate-ios-row"
                    style={{ animationDelay: `${i * 20}ms` }}
                    onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                  >
                    <td className="px-5 py-3.5 font-semibold text-ios-label">
                      {p.nombre}
                      {p.codigo && (
                        <span className="block text-[11px] font-normal text-ios-tertiary mt-0.5">Código: {p.codigo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {expandedId === p._id ? (
                        <div className="text-xs leading-relaxed space-y-0.5 animate-slideDown">
                          {p.colores?.length > 0
                            ? p.colores.map((color) => {
                                const vars = (p.variantes || []).filter((v) => v.color === color);
                                return (
                                  <div key={color}>
                                    <span className="font-semibold text-ios-secondary">{color}: </span>
                                    {vars.length > 0
                                      ? vars.map((v, i) => (
                                          <span key={i} className="text-ios-tertiary">
                                            {v.talle}({v.cantidad}){v.deposito ? ` dep:${v.deposito}` : ''}{i < vars.length - 1 ? ' · ' : ''}
                                          </span>
                                        ))
                                      : <span className="text-ios-tertiary">—</span>}
                                  </div>
                                );
                              })
                            : p.variantes?.length > 0
                              ? p.variantes.map((v, i) => (
                                  <span key={i} className="text-ios-tertiary">
                                    {variantShortLabel(v)}:{v.cantidad}{v.deposito ? ` (dep ${v.deposito})` : ''}{i < p.variantes.length - 1 ? ', ' : ''}
                                  </span>
                                ))
                              : <span className="text-ios-tertiary">—</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs">
                          <IconChevronDown className={`w-3 h-3 text-ios-tertiary transition-transform ${expandedId === p._id ? 'rotate-180' : ''}`} strokeWidth={2.2} />
                          {p.colores?.length > 0 ? (
                            <span className="text-ios-tertiary">
                              {p.colores.slice(0, 3).map((c, i) => {
                                const count = (p.variantes || []).filter((v) => v.color === c).length;
                                return (
                                  <span key={c}>
                                    {i > 0 && <span className="text-ios-separator"> · </span>}
                                    <span className="text-ios-secondary">{c}</span>
                                    <span className="text-ios-tertiary">(+{count})</span>
                                  </span>
                                );
                              })}
                              {p.colores.length > 3 && <span className="text-ios-tertiary ml-1">· +{p.colores.length - 3} más</span>}
                            </span>
                          ) : p.variantes?.length > 0 ? (
                            <span className="text-ios-secondary">{p.variantes.length} variantes</span>
                          ) : (
                            <span className="text-ios-tertiary">—</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ios-secondary">
                      {p.precio != null ? formatMoney(p.precio) : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${(p.stockMinimo != null && p.cantidad <= p.stockMinimo) ? 'text-ios-red font-semibold' : 'text-ios-label'}`}>
                        {(p.stockMinimo != null && p.cantidad <= p.stockMinimo) && (
                          <IconAlert className="w-4 h-4" strokeWidth={2} />
                        )}
                        {p.cantidad}
                      </span>
                      <span className="block text-[11px] text-ios-tertiary mt-0.5">Dep: {depositoTotal(p)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-ios-tertiary">{p.categoria}</td>
                    <td className="px-4 py-3.5 text-ios-tertiary">{p.proveedor || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dropdown.product?._id === p._id) {
                            setDropdown({ product: null, x: 0, y: 0 });
                          } else {
                            anchorRef.current = e.currentTarget.getBoundingClientRect();
                            setDropdown({ product: p, x: 0, y: 0 });
                          }
                        }}
                        className="p-2 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
                        aria-label={`Acciones de ${p.nombre}`}
                        aria-haspopup="menu"
                        aria-expanded={dropdown.product?._id === p._id}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div className="md:hidden space-y-2.5">
          {products.length === 0 ? (
            <div className="text-center py-10 text-ios-tertiary text-sm">
              {error || 'No hay productos'}
            </div>
          ) : (
            products.map((p, i) => (
              <div key={p._id} className="bg-ios-surface border border-ios-separator/30 rounded-2xl px-4 py-3.5 shadow-ios-card animate-ios-row" style={{ animationDelay: `${i * 20}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ios-label">{p.nombre}</p>
                    <p className="text-xs text-ios-tertiary mt-0.5">
                      {p.categoria}
                      {p.proveedor ? ` · ${p.proveedor}` : ''}
                    </p>
                    {p.codigo && (
                      <p className="text-[11px] text-ios-tertiary mt-0.5">Código: {p.codigo}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${(p.stockMinimo != null && p.cantidad <= p.stockMinimo) ? 'bg-ios-red/15 text-ios-red' : 'bg-ios-surface2 text-ios-secondary'}`}>
                      {p.cantidad}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300">
                      Dep {depositoTotal(p)}
                    </span>
                    <button
                      onClick={(e) => {
                        if (dropdown.product?._id === p._id) {
                          setDropdown({ product: null, x: 0, y: 0 });
                        } else {
                          anchorRef.current = e.currentTarget.getBoundingClientRect();
                          setDropdown({ product: p, x: 0, y: 0 });
                        }
                      }}
                      className="p-2 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                  className="w-full flex items-center justify-between mt-3 text-left"
                >
                  <span className="text-ios-secondary font-medium">
                    {p.precio != null ? formatMoney(p.precio) : '—'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ios-tertiary">
                    {p.colores?.length > 0
                      ? `${p.colores.length} ${p.colores.length === 1 ? 'color' : 'colores'}`
                      : p.variantes?.length > 0
                        ? `${p.variantes.length} variantes`
                        : 'Ver detalle'}
                    <IconChevronDown className={`w-3 h-3 transition-transform ${expandedId === p._id ? 'rotate-180' : ''}`} strokeWidth={2.2} />
                  </span>
                </button>
                {expandedId === p._id && (
                  <div className="mt-3 pt-3 border-t border-ios-separator/40 text-xs leading-relaxed space-y-1 animate-slideDown">
                    {p.colores?.length > 0
                      ? p.colores.map((color) => {
                          const vars = (p.variantes || []).filter((v) => v.color === color);
                          return (
                            <div key={color}>
                              <span className="font-semibold text-ios-secondary">{color}: </span>
                              {vars.length > 0
                                ? vars.map((v, i) => (
                                    <span key={i} className="text-ios-tertiary">
                                      {v.talle}({v.cantidad}){v.deposito ? ` dep:${v.deposito}` : ''}{i < vars.length - 1 ? ' · ' : ''}
                                    </span>
                                  ))
                                : <span className="text-ios-tertiary">—</span>}
                            </div>
                          );
                        })
                      : p.variantes?.length > 0
                        ? p.variantes.map((v, i) => (
                            <span key={i} className="text-ios-tertiary">
                              {variantShortLabel(v)}:{v.cantidad}{v.deposito ? ` (dep ${v.deposito})` : ''}{i < p.variantes.length - 1 ? ', ' : ''}
                            </span>
                          ))
                        : <span className="text-ios-tertiary">—</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {dropdown.product && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setDropdown({ product: null, x: 0, y: 0 })} />
          <div
            ref={dropdownRef}
            className="fixed z-40 w-48 bg-ios-surface/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-ios-alert p-1.5 animate-ios-modal"
            style={{ left: dropdown.x, top: dropdown.y }}
          >
            <button
              onClick={() => handleDropdownAction('carrito')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-orange hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconCart className="w-4 h-4" />
              Vender
            </button>
            {usuario?.rol === 'admin' && (
              <button
                onClick={() => handleDropdownAction('retirar')}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-amber-400 hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
              >
                <IconArrowUp className="w-4 h-4" />
                Retirar a depósito
              </button>
            )}
            <button
              onClick={() => handleDropdownAction('devolver')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-red hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconReturn className="w-4 h-4" />
              Devolver
            </button>
            <button
              onClick={() => handleDropdownAction('cambiar')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-purple hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconRefresh className="w-4 h-4" />
              Cambiar
            </button>
            {usuario?.rol === 'admin' && (
              <button
                onClick={() => handleDropdownAction('eliminar')}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-red hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
              >
                <IconTrash className="w-4 h-4" />
                Eliminar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Productos;
