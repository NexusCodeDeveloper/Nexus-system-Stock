import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getProducts, createProduct, updateProduct, deleteProduct, addDeposito, reponerStock } from '../../api/products';
import { getStockMovements } from '../../api/stockMovements';
import { getApiErrorMessage } from '../../utils/apiError';
import { printLabel } from '../../utils/printLabel';
import { useAuth } from '../../context/AuthContext';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import IosToggle from '../../components/ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../../components/ui/IosForm';
import ProductForm from '../../components/ProductForm/ProductForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { IconArrowUp, IconChevronDown, IconHistory, IconPencil, IconPlus, IconPrint, IconRefresh, IconTrash, IconWarehouse } from '../../components/ui/icons';

const variantLabel = (v) => [v.talle, v.color].filter(Boolean).join(' / ') || 'Base';

const depositoTotal = (p) =>
  p.variants?.length > 0 ? p.variants.reduce((s, v) => s + (v.deposito || 0), 0) : (p.deposito || 0);

const salonTotal = (p) =>
  p.variants?.length > 0 ? p.variants.reduce((s, v) => s + (v.cantidad || 0), 0) : (p.cantidad || 0);

const formatDate = (date) =>
  new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const TIPOS = {
  ingreso_deposito: { label: 'Ingreso a depósito', cls: 'bg-violet-500/15 text-violet-300' },
  ajuste_deposito: { label: 'Ajuste de depósito', cls: 'bg-violet-500/15 text-violet-300' },
  reposicion: { label: 'Reposición a salón', cls: 'bg-ios-green/15 text-ios-green' },
  retiro_deposito: { label: 'Retiro a depósito', cls: 'bg-amber-500/15 text-amber-400' },
  ajuste_salon: { label: 'Ajuste de salón', cls: 'bg-ios-surface2 text-ios-secondary' },
};

const TITULOS_MODAL = {
  reponer: 'Pasar al salón',
  cargar: 'Reponer stock',
};

const MEDIDAS_ETIQUETA = {
  '60x40': { ancho: 60, alto: 40 },
  '58x40': { ancho: 58, alto: 40 },
  '50x30': { ancho: 50, alto: 30 },
  '40x30': { ancho: 40, alto: 30 },
};

const Deposito = () => {
  const { user } = useAuth();
  const { show: alert, confirm, toast } = useIosAlert();
  const esAdmin = user?.rol === 'admin';
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState('stock');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [soloConStock, setSoloConStock] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [dropdown, setDropdown] = useState({ product: null, x: 0, y: 0 });
  const dropdownRef = useRef(null);
  const anchorRef = useRef(null);

  const [stockModal, setStockModal] = useState(null);
  const [modalCantidad, setModalCantidad] = useState('1');
  const [modalVariantIdx, setModalVariantIdx] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [etiquetaModal, setEtiquetaModal] = useState(null);
  const [etiquetaCantidad, setEtiquetaCantidad] = useState('1');
  const [etiquetaModo, setEtiquetaModo] = useState('etiqueta');
  const [etiquetaGuias, setEtiquetaGuias] = useState(true);
  const [etiquetaMedida, setEtiquetaMedida] = useState('60x40');
  const [etiquetaAncho, setEtiquetaAncho] = useState('60');
  const [etiquetaAlto, setEtiquetaAlto] = useState('40');
  const [etiquetaPrecio, setEtiquetaPrecio] = useState(true);
  const [etiquetaQr, setEtiquetaQr] = useState(true);
  const [etiquetaSaving, setEtiquetaSaving] = useState(false);

  const [movimientos, setMovimientos] = useState([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState('');
  const [movTipo, setMovTipo] = useState('');

  const fetchProductos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getProducts();
      setProductos(res.data || []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar productos'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMovimientos = async () => {
    setMovLoading(true);
    setMovError('');
    try {
      const params = {};
      if (movTipo) params.tipo = movTipo;
      const res = await getStockMovements(params);
      setMovimientos(res.data || []);
    } catch (err) {
      setMovError(getApiErrorMessage(err, 'Error al cargar movimientos'));
    } finally {
      setMovLoading(false);
    }
  };

  const handleGuardar = async (data) => {
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateProduct(editing._id, data);
      } else {
        await createProduct(data);
      }
      setShowForm(false);
      setEditing(null);
      fetchProductos();
      toast({ message: editing ? 'Producto actualizado' : 'Producto creado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al guardar producto') });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, []);

  useEffect(() => {
    if (location.state?.crear) {
      setEditing(null);
      setShowForm(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (tab === 'movimientos' && esAdmin) fetchMovimientos();
  }, [tab, movTipo]);

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

  const openDropdown = (e, p) => {
    e.stopPropagation();
    if (dropdown.product?._id === p._id) {
      setDropdown({ product: null, x: 0, y: 0 });
    } else {
      anchorRef.current = e.currentTarget.getBoundingClientRect();
      setDropdown({ product: p, x: 0, y: 0 });
    }
  };

  const cerrarDropdown = () => setDropdown({ product: null, x: 0, y: 0 });

  const handleDelete = async (p) => {
    cerrarDropdown();
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este producto?',
      message: 'Se elimina el producto con su stock de salón y de depósito. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProduct(p._id);
      fetchProductos();
      toast({ message: 'Producto eliminado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al eliminar producto') });
    }
  };

  const abrirEtiqueta = (p) => {
    setEtiquetaCantidad('1');
    setEtiquetaModo('etiqueta');
    setEtiquetaGuias(true);
    setEtiquetaMedida('60x40');
    setEtiquetaAncho('60');
    setEtiquetaAlto('40');
    setEtiquetaPrecio(true);
    setEtiquetaQr(true);
    setEtiquetaModal(p);
  };

  const medidaEtiqueta = etiquetaMedida === 'custom'
    ? { ancho: Number(etiquetaAncho) || 0, alto: Number(etiquetaAlto) || 0 }
    : (MEDIDAS_ETIQUETA[etiquetaMedida] || MEDIDAS_ETIQUETA['60x40']);

  const etiquetasPorHoja = (() => {
    const { ancho, alto } = medidaEtiqueta;
    if (ancho <= 0 || alto <= 0) return 0;
    return Math.max(1, Math.floor(210 / ancho)) * Math.max(1, Math.floor(297 / alto));
  })();

  const confirmarEtiqueta = async () => {
    if (!etiquetaModal || etiquetaSaving) return;
    const cantidad = Number(etiquetaCantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Ingresá un número entre 1 y 100' });
      return;
    }
    const { ancho, alto } = medidaEtiqueta;
    if (ancho < 20 || ancho > 210 || alto < 10 || alto > 297) {
      alert({
        icon: 'warning',
        title: 'Medida inválida',
        message: 'Ingresá un ancho entre 20 y 210 mm y un alto entre 10 y 297 mm',
      });
      return;
    }
    setEtiquetaSaving(true);
    try {
      const ok = await printLabel(etiquetaModal, {
        cantidad,
        modo: etiquetaModo,
        guias: etiquetaGuias,
        medida: { ancho, alto },
        mostrarPrecio: etiquetaPrecio,
        mostrarQr: etiquetaQr,
      });
      if (ok) setEtiquetaModal(null);
      else alert({ icon: 'warning', title: 'No se pudo imprimir', message: 'Habilitá las ventanas emergentes para imprimir' });
    } finally {
      setEtiquetaSaving(false);
    }
  };

  const abrirModal = (producto, modo) => {
    setStockModal({ producto, modo });
    setModalCantidad('1');
    setModalVariantIdx(producto.variants?.length === 1 ? '0' : '');
  };

  const modalProducto = stockModal?.producto;
  const modalVariants = modalProducto?.variants || [];
  const modalVariant = modalVariants[Number(modalVariantIdx)] || null;

  const disponibleModal = (() => {
    if (!modalProducto) return 0;
    return modalVariant ? (modalVariant.deposito || 0) : (modalProducto.deposito || 0);
  })();

  const confirmarModal = async () => {
    if (!stockModal || modalSaving) return;
    const cantidad = Number(modalCantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe ser al menos 1' });
      return;
    }
    if (modalVariants.length > 0 && modalVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Seleccioná la variante' });
      return;
    }

    const payload = {
      cantidad,
      talle: modalVariant?.talle || '',
      color: modalVariant?.color || '',
    };

    setModalSaving(true);
    try {
      if (stockModal.modo === 'reponer') {
        await reponerStock(modalProducto._id, payload);
        toast({ message: `Repuesto al salón: ${modalProducto.nombre}` });
      } else {
        await addDeposito(modalProducto._id, payload);
        toast({ message: `Depósito actualizado: ${modalProducto.nombre}` });
      }
      setStockModal(null);
      fetchProductos();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'No se pudo mover el stock') });
    } finally {
      setModalSaving(false);
    }
  };

  const filtrados = productos.filter((p) => {
    if (soloConStock && depositoTotal(p) <= 0) return false;
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      (p.nombre || '').toLowerCase().includes(term) ||
      (p.categoria || '').toLowerCase().includes(term) ||
      (p.codigo || '').toLowerCase().includes(term)
    );
  });

  const botonAcciones = (p) => (
    <button
      onClick={(e) => openDropdown(e, p)}
      className="p-2 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
      aria-label="Acciones del producto"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
      </svg>
    </button>
  );

  const detalleVariantes = (p) =>
    p.variants?.length > 0 ? (
      <div className="text-xs text-ios-tertiary space-y-0.5">
        {p.variants.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-ios-secondary font-medium">{variantLabel(v)}</span>
            <span>Dep: {v.deposito || 0}</span>
            <span>·</span>
            <span>Salón: {v.cantidad || 0}</span>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Depósito General</h1>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && (
            <IosButton variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <IconPlus className="w-4 h-4" />
              Nuevo Producto
            </IosButton>
          )}
          <button
            onClick={() => (tab === 'stock' ? fetchProductos() : fetchMovimientos())}
            className="ios-btn-press flex items-center gap-2 px-3.5 py-2 bg-ios-surface2 rounded-ios-pill text-sm text-ios-secondary font-medium hover:bg-ios-surface3 transition-colors"
          >
            <IconRefresh className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('stock')}
          className={`px-4 py-2 rounded-ios-pill text-sm font-semibold transition-colors ${
            tab === 'stock' ? 'bg-ios-tint text-white' : 'bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3'
          }`}
        >
          Stock
        </button>
        {esAdmin && (
          <button
            onClick={() => setTab('movimientos')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-ios-pill text-sm font-semibold transition-colors ${
              tab === 'movimientos' ? 'bg-ios-tint text-white' : 'bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3'
            }`}
          >
            <IconHistory className="w-4 h-4" />
            Movimientos
          </button>
        )}
      </div>

      {tab === 'stock' && (
        <>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <IosSearch
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre, categoría o código..."
              className="w-full md:w-96"
            />
            <button
              onClick={() => setSoloConStock(!soloConStock)}
              className={`px-3.5 py-2 rounded-ios-pill text-sm font-medium transition-colors ${
                soloConStock
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'bg-ios-surface2 text-ios-tertiary border border-transparent hover:bg-ios-surface3'
              }`}
            >
              Solo con depósito
            </button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : filtrados.length === 0 ? (
            <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
              <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
                <IconWarehouse className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
              </div>
              <p className="text-ios-tertiary text-sm">
                {soloConStock ? 'No hay productos con stock en depósito' : 'No hay productos'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-ios-surface rounded-3xl overflow-hidden shadow-ios-card border border-ios-separator/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Producto</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Código</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Depósito</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Salón</th>
                      <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((p) => (
                      <tr
                        key={p._id}
                        onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                        className="border-t border-ios-separator/30 transition-colors hover:bg-ios-hover/[0.03] cursor-pointer"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {p.variants?.length > 0 && (
                              <IconChevronDown
                                className={`w-3 h-3 text-ios-tertiary transition-transform ${expandedId === p._id ? 'rotate-180' : ''}`}
                                strokeWidth={2.2}
                              />
                            )}
                            <span className="font-semibold text-ios-label">{p.nombre}</span>
                          </div>
                          <p className="text-[11px] text-ios-tertiary mt-0.5">{p.categoria || '—'}</p>
                          {expandedId === p._id && <div className="mt-2">{detalleVariantes(p)}</div>}
                        </td>
                        <td className="px-4 py-3.5 text-ios-secondary text-xs tabular-nums">{p.codigo || '—'}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                            depositoTotal(p) > 0 ? 'bg-violet-500/15 text-violet-300' : 'bg-ios-surface2 text-ios-tertiary'
                          }`}>
                            {depositoTotal(p)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                            salonTotal(p) > 0 ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-red/15 text-ios-red'
                          }`}>
                            {salonTotal(p)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">{botonAcciones(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-2.5">
                {filtrados.map((p) => (
                  <div key={p._id} className="bg-ios-surface border border-ios-separator/30 rounded-2xl px-4 py-3.5 shadow-ios-card">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-semibold text-ios-label">{p.nombre}</p>
                        <p className="text-xs text-ios-tertiary mt-0.5">
                          {p.categoria || '—'}
                          {p.codigo ? ` · ${p.codigo}` : ''}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                            depositoTotal(p) > 0 ? 'bg-violet-500/15 text-violet-300' : 'bg-ios-surface2 text-ios-tertiary'
                          }`}>
                            Dep {depositoTotal(p)}
                          </span>
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                            salonTotal(p) > 0 ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-red/15 text-ios-red'
                          }`}>
                            Salón {salonTotal(p)}
                          </span>
                        </div>
                      </button>
                      <div className="shrink-0">{botonAcciones(p)}</div>
                    </div>
                    {expandedId === p._id && p.variants?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-ios-separator/40">{detalleVariantes(p)}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'movimientos' && esAdmin && (
        <>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <IosSelect value={movTipo} onChange={(e) => setMovTipo(e.target.value)} className="w-full sm:w-64">
              <option value="" className="bg-ios-surface2">Todos los movimientos</option>
              {Object.entries(TIPOS).map(([key, info]) => (
                <option key={key} value={key} className="bg-ios-surface2">{info.label}</option>
              ))}
            </IosSelect>
          </div>

          {movError && (
            <div className="mb-4 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
              {movError}
            </div>
          )}

          {movLoading ? (
            <LoadingSpinner />
          ) : movimientos.length === 0 ? (
            <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
              <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
                <IconHistory className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
              </div>
              <p className="text-ios-tertiary text-sm">No hay movimientos registrados</p>
            </div>
          ) : (
            <div className="bg-ios-surface rounded-3xl overflow-hidden shadow-ios-card border border-ios-separator/30">
              <div className="divide-y divide-ios-separator/30">
                {movimientos.map((m) => {
                  const info = TIPOS[m.tipo] || { label: m.tipo, cls: 'bg-ios-surface2 text-ios-secondary' };
                  const variante = [m.talle, m.color].filter(Boolean).join(' / ');
                  return (
                    <div key={m._id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ios-label text-sm truncate">{m.productoNombre || 'Producto'}</span>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.cls}`}>
                            {info.label}
                          </span>
                        </div>
                        <p className="text-xs text-ios-tertiary mt-0.5">
                          {variante ? `${variante} · ` : ''}{m.empleado || '—'} · {formatDate(m.createdAt)}
                        </p>
                      </div>
                      <span className="text-ios-label font-bold tabular-nums shrink-0">{m.cantidad} u.</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {dropdown.product && (
        <>
          <div className="fixed inset-0 z-30" onClick={cerrarDropdown} />
          <div
            ref={dropdownRef}
            className="fixed z-40 w-52 bg-ios-surface/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-ios-alert p-1.5 animate-ios-modal"
            style={{ left: dropdown.x, top: dropdown.y }}
          >
            <button
              onClick={() => {
                const p = dropdown.product;
                cerrarDropdown();
                abrirModal(p, 'reponer');
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-green hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconArrowUp className="w-4 h-4" />
              Pasar al salón
            </button>
            {dropdown.product?.codigo && (
              <button
                onClick={() => {
                  const p = dropdown.product;
                  cerrarDropdown();
                  abrirEtiqueta(p);
                }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-secondary hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
              >
                <IconPrint className="w-4 h-4" />
                Imprimir etiqueta
              </button>
            )}
            {esAdmin && (
              <>
                <button
                  onClick={() => {
                    const p = dropdown.product;
                    cerrarDropdown();
                    setEditing(p);
                    setShowForm(true);
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-secondary hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
                >
                  <IconPencil className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    const p = dropdown.product;
                    cerrarDropdown();
                    abrirModal(p, 'cargar');
                  }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-tint hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
                >
                  <IconPlus className="w-4 h-4" />
                  Reponer stock
                </button>
                <button
                  onClick={() => handleDelete(dropdown.product)}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-red hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
                >
                  <IconTrash className="w-4 h-4" />
                  Eliminar
                </button>
              </>
            )}
          </div>
        </>
      )}

      <IosModal
        open={!!stockModal}
        onClose={() => setStockModal(null)}
        title={stockModal ? TITULOS_MODAL[stockModal.modo] : ''}
        cancelText="Cancelar"
        confirmText={modalSaving ? 'Guardando…' : TITULOS_MODAL[stockModal?.modo]?.split(' ')[0] || 'Confirmar'}
        confirmVariant="primary"
        onConfirm={confirmarModal}
        confirmDisabled={modalSaving}
        maxWidth="max-w-md"
      >
        {modalProducto && (
          <div className="space-y-4">
            <p className="text-ios-label font-semibold text-sm">
              {modalProducto.nombre}
              {modalProducto.codigo && <span className="text-ios-tertiary font-normal"> · {modalProducto.codigo}</span>}
            </p>

            {modalVariants.length > 0 && (
              <IosField label="Variante" required>
                <IosSelect value={modalVariantIdx} onChange={(e) => setModalVariantIdx(e.target.value)}>
                  <option value="" className="bg-ios-surface2">Seleccionar...</option>
                  {modalVariants.map((v, i) => (
                    <option key={i} value={String(i)} className="bg-ios-surface2">
                      {variantLabel(v)} (dep: {v.deposito || 0} · salón: {v.cantidad || 0})
                    </option>
                  ))}
                </IosSelect>
              </IosField>
            )}

            <div className="rounded-2xl px-4 py-3 bg-ios-surface2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-ios-tertiary">En depósito</span>
                <span className="text-ios-label font-semibold tabular-nums">
                  {modalVariant ? (modalVariant.deposito || 0) : (modalProducto.deposito || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ios-tertiary">En salón</span>
                <span className="text-ios-label font-semibold tabular-nums">
                  {modalVariant ? (modalVariant.cantidad || 0) : (modalProducto.cantidad || 0)}
                </span>
              </div>
            </div>

            <IosField
              label="Cantidad"
              hint={
                stockModal.modo === 'reponer'
                  ? `Disponible en depósito: ${disponibleModal}`
                  : 'Se sumará al depósito'
              }
            >
              <IosInput
                type="text"
                inputMode="numeric"
                value={modalCantidad}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) setModalCantidad(v);
                }}
              />
            </IosField>
          </div>
        )}
      </IosModal>

      <IosModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        maxWidth="max-w-2xl"
      >
        <h2 className="text-[17px] font-semibold text-ios-label mb-4">
          {editing ? 'Editar Producto' : 'Nuevo Producto'}
        </h2>
        <ProductForm
          key={editing?._id ?? 'nuevo'}
          initial={editing}
          onSubmit={handleGuardar}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          isSubmitting={isSubmitting}
        />
      </IosModal>

      <IosModal
        open={!!etiquetaModal}
        onClose={() => setEtiquetaModal(null)}
        title="Imprimir etiqueta"
        cancelText="Cancelar"
        confirmText={etiquetaSaving ? 'Generando…' : 'Imprimir'}
        onConfirm={confirmarEtiqueta}
        confirmDisabled={etiquetaSaving}
        maxWidth="max-w-md"
      >
        {etiquetaModal && (
          <div className="space-y-4">
            <p className="text-ios-secondary text-sm">
              <span className="text-ios-label font-semibold">{etiquetaModal.nombre}</span>
              {etiquetaModal.codigo && <span className="text-ios-tertiary"> · {etiquetaModal.codigo}</span>}
            </p>

            <div>
              <p className="block text-[13px] text-ios-secondary font-medium mb-1.5">Formato</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEtiquetaModo('etiqueta')}
                  className={`flex-1 px-3 py-2 text-sm rounded-ios-control border transition-all font-medium ${
                    etiquetaModo === 'etiqueta'
                      ? 'bg-ios-tint/15 text-ios-tint border-ios-tint/30'
                      : 'bg-ios-surface2 text-ios-tertiary border-transparent hover:bg-ios-surface3'
                  }`}
                >
                  Etiqueta (una por página)
                </button>
                <button
                  type="button"
                  onClick={() => setEtiquetaModo('hoja')}
                  className={`flex-1 px-3 py-2 text-sm rounded-ios-control border transition-all font-medium ${
                    etiquetaModo === 'hoja'
                      ? 'bg-ios-tint/15 text-ios-tint border-ios-tint/30'
                      : 'bg-ios-surface2 text-ios-tertiary border-transparent hover:bg-ios-surface3'
                  }`}
                >
                  Hoja A4 (grilla)
                </button>
              </div>
            </div>

            <IosField label="Medida de la etiqueta">
              <IosSelect value={etiquetaMedida} onChange={(e) => setEtiquetaMedida(e.target.value)}>
                <option value="60x40" className="bg-ios-surface2">60 × 40 mm</option>
                <option value="58x40" className="bg-ios-surface2">58 × 40 mm</option>
                <option value="50x30" className="bg-ios-surface2">50 × 30 mm</option>
                <option value="40x30" className="bg-ios-surface2">40 × 30 mm</option>
                <option value="custom" className="bg-ios-surface2">Personalizada…</option>
              </IosSelect>
            </IosField>

            {etiquetaMedida === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <IosField label="Ancho (mm)">
                  <IosInput
                    type="text"
                    inputMode="numeric"
                    value={etiquetaAncho}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d{1,3}$/.test(v)) setEtiquetaAncho(v);
                    }}
                  />
                </IosField>
                <IosField label="Alto (mm)">
                  <IosInput
                    type="text"
                    inputMode="numeric"
                    value={etiquetaAlto}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d{1,3}$/.test(v)) setEtiquetaAlto(v);
                    }}
                  />
                </IosField>
              </div>
            )}

            <IosField label="Cantidad de etiquetas" hint="Entre 1 y 100">
              <IosInput
                type="text"
                inputMode="numeric"
                value={etiquetaCantidad}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d{1,3}$/.test(v)) setEtiquetaCantidad(v);
                }}
              />
            </IosField>

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-sm text-ios-secondary font-medium">Mostrar QR</span>
              <IosToggle checked={etiquetaQr} onChange={setEtiquetaQr} />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-sm text-ios-secondary font-medium">Mostrar precio</span>
              <IosToggle checked={etiquetaPrecio} onChange={setEtiquetaPrecio} />
            </label>

            {etiquetaModo === 'hoja' && (
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <span className="text-sm text-ios-secondary font-medium">Guías de corte</span>
                <IosToggle checked={etiquetaGuias} onChange={setEtiquetaGuias} />
              </label>
            )}

            <p className="text-ios-tertiary text-[11px] leading-relaxed">
              {etiquetaModo === 'hoja'
                ? (etiquetasPorHoja > 0
                    ? `${etiquetasPorHoja} por hoja · se usarán ${Math.max(1, Math.ceil((Number(etiquetaCantidad) || 1) / etiquetasPorHoja))} hoja(s) A4.`
                    : 'Ingresá una medida válida para calcular las hojas.')
                : `${Number(etiquetaCantidad) || 1} etiqueta(s) de ${medidaEtiqueta.ancho || '—'}×${medidaEtiqueta.alto || '—'} mm, una por página.`}
              {' '}En el diálogo de impresión elegí márgenes en 0, escala 100% y sin encabezados ni pies.
            </p>
          </div>
        )}
      </IosModal>
    </div>
  );
};

export default Deposito;
