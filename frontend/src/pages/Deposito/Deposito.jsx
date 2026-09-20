import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { obtenerProductos, crearProducto, actualizarProducto, eliminarProducto, addDeposito, reponerStock, pasarSalon } from '../../api/productos';
import { obtenerMovimientosStock } from '../../api/movimientosStock';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { printLabel } from '../../utils/printLabel';
import { formatDate, formatMoney } from '../../utils/format';
import { getItem, setItem } from '../../utils/storage';
import { useAutenticacion } from '../../context/AutenticacionContext';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import IosToggle from '../../components/ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../../components/ui/IosForm';
import FormularioProducto from '../../components/FormularioProducto/FormularioProducto';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { IconArrowUp, IconChevronDown, IconHistory, IconPencil, IconPlus, IconPrint, IconRefresh, IconTrash, IconWarehouse } from '../../components/ui/icons';

const variantLabel = (v) => [v.talle, v.color].filter(Boolean).join(' / ') || 'Base';

const depositoTotal = (p) =>
  p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (v.deposito || 0), 0) : (p.deposito || 0);

const salonTotal = (p) =>
  p.variantes?.length > 0 ? p.variantes.reduce((s, v) => s + (v.cantidad || 0), 0) : (p.cantidad || 0);

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

const ETIQUETA_PREFS_KEY = 'deposito-etiqueta-prefs';
const LIMITE_PRODUCTOS = 1000;

const Deposito = () => {
  const { usuario } = useAutenticacion();
  const { show: alert, confirm, toast } = useIosAlert();
  const esAdmin = usuario?.rol === 'admin';
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
  const productosSeqRef = useRef(0);
  const movSeqRef = useRef(0);

  const [stockModal, setStockModal] = useState(null);
  const [modalCantidad, setModalCantidad] = useState('1');
  const [modalVariantIdx, setModalVariantIdx] = useState('');
  const [modalNuevoTalle, setModalNuevoTalle] = useState('');
  const [modalNuevoColor, setModalNuevoColor] = useState('');
  const [modalFijar, setModalFijar] = useState(false);
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
  const [movBuscar, setMovBuscar] = useState('');
  const [movDesde, setMovDesde] = useState('');
  const [movHasta, setMovHasta] = useState('');
  const [movLimit, setMovLimit] = useState(100);
  const [pasarTodoSaving, setPasarTodoSaving] = useState(false);

  const fetchProductos = async (buscar = search) => {
    const seq = ++productosSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const term = String(buscar || '').trim();
      const res = await obtenerProductos(term ? { search: term } : undefined);
      if (seq !== productosSeqRef.current) return;
      setProductos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (seq !== productosSeqRef.current) return;
      setError(obtenerMensajeErrorApi(err, 'Error al cargar productos'));
    } finally {
      if (seq === productosSeqRef.current) setLoading(false);
    }
  };

  const fetchMovimientos = async () => {
    const seq = ++movSeqRef.current;
    setMovLoading(true);
    setMovError('');
    try {
      const params = { limit: movLimit };
      if (movTipo) params.tipo = movTipo;
      if (movBuscar.trim()) params.buscar = movBuscar.trim();
      if (movDesde) params.desde = movDesde;
      if (movHasta) params.hasta = movHasta;
      if (movDesde || movHasta) params.tz = new Date().getTimezoneOffset();
      const res = await obtenerMovimientosStock(params);
      if (seq !== movSeqRef.current) return;
      setMovimientos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (seq !== movSeqRef.current) return;
      setMovError(obtenerMensajeErrorApi(err, 'Error al cargar movimientos'));
    } finally {
      if (seq === movSeqRef.current) setMovLoading(false);
    }
  };

  const handleGuardar = async (data) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        await actualizarProducto(editing._id, data);
      } else {
        await crearProducto(data);
      }
      setShowForm(false);
      setEditing(null);
      fetchProductos();
      toast({ message: editing ? 'Producto actualizado' : 'Producto creado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al guardar producto') });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchProductos(search), search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (location.state?.crear) {
      setEditing(null);
      setShowForm(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (tab !== 'movimientos' || !esAdmin) return undefined;
    const timer = setTimeout(() => fetchMovimientos(), movBuscar.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, movTipo, movBuscar, movDesde, movHasta, movLimit, esAdmin]);

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
      await eliminarProducto(p._id);
      fetchProductos();
      toast({ message: 'Producto eliminado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar producto') });
    }
  };

  const abrirEtiqueta = (p) => {
    const prefs = (() => {
      try {
        return JSON.parse(getItem(ETIQUETA_PREFS_KEY) || '{}');
      } catch {
        return {};
      }
    })();
    const medidaValida = prefs.medida === 'custom' || MEDIDAS_ETIQUETA[prefs.medida] ? prefs.medida : '60x40';
    setEtiquetaCantidad('1');
    setEtiquetaModo(prefs.modo === 'hoja' ? 'hoja' : 'etiqueta');
    setEtiquetaGuias(prefs.guias !== false);
    setEtiquetaMedida(medidaValida);
    setEtiquetaAncho(prefs.ancho ? String(prefs.ancho) : '60');
    setEtiquetaAlto(prefs.alto ? String(prefs.alto) : '40');
    setEtiquetaPrecio(prefs.precio !== false);
    setEtiquetaQr(prefs.qr !== false);
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
      if (ok) {
        setItem(ETIQUETA_PREFS_KEY, JSON.stringify({
          modo: etiquetaModo,
          guias: etiquetaGuias,
          medida: etiquetaMedida,
          ancho,
          alto,
          precio: etiquetaPrecio,
          qr: etiquetaQr,
        }));
        setEtiquetaModal(null);
      } else {
        alert({ icon: 'warning', title: 'No se pudo imprimir', message: 'Habilitá las ventanas emergentes para imprimir' });
      }
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo imprimir la etiqueta') });
    } finally {
      setEtiquetaSaving(false);
    }
  };

  const abrirModal = (producto, modo) => {
    setStockModal({ producto, modo });
    setModalCantidad('1');
    setModalVariantIdx(producto.variantes?.length === 1 ? '0' : '');
    setModalNuevoTalle('');
    setModalNuevoColor('');
    setModalFijar(false);
  };

  const modalProducto = stockModal?.producto;
  const modalVariants = modalProducto?.variantes || [];
  const modalVariant = modalVariants[Number(modalVariantIdx)] || null;
  const modalEsNueva = stockModal?.modo === 'cargar' && modalVariants.length > 0 && modalVariantIdx === '__nueva__';

  const disponibleModal = (() => {
    if (!modalProducto) return 0;
    if (modalEsNueva) return 0;
    return modalVariant ? (modalVariant.deposito || 0) : (modalProducto.deposito || 0);
  })();

  const confirmarModal = async () => {
    if (!stockModal || modalSaving) return;
    const esFijar = stockModal.modo === 'cargar' && modalFijar;
    const cantidad = Number(modalCantidad);
    if (!Number.isInteger(cantidad) || cantidad < 0 || (!esFijar && cantidad < 1)) {
      alert({
        icon: 'warning',
        title: 'Cantidad inválida',
        message: esFijar ? 'Ingresá una cantidad válida (0 o más)' : 'Debe ser al menos 1',
      });
      return;
    }
    if (modalVariants.length > 0 && modalVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Seleccioná la variante' });
      return;
    }
    if (modalEsNueva && !modalNuevoTalle.trim() && !modalNuevoColor.trim()) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Ingresá el talle o el color de la nueva variante' });
      return;
    }
    if (stockModal.modo === 'reponer' && cantidad > disponibleModal) {
      alert({ icon: 'warning', title: 'Stock insuficiente', message: `Solo hay ${disponibleModal} unidad(es) en depósito` });
      return;
    }

    const payload = {
      cantidad,
      talle: modalEsNueva ? modalNuevoTalle.trim() : (modalVariant?.talle || ''),
      color: modalEsNueva ? modalNuevoColor.trim() : (modalVariant?.color || ''),
    };
    if (esFijar) payload.modo = 'fijar';

    setModalSaving(true);
    try {
      if (stockModal.modo === 'reponer') {
        await reponerStock(modalProducto._id, payload);
        toast({ message: `Repuesto al salón: ${modalProducto.nombre}` });
      } else {
        await addDeposito(modalProducto._id, payload);
        toast({ message: esFijar ? `Depósito ajustado: ${modalProducto.nombre}` : `Depósito actualizado: ${modalProducto.nombre}` });
      }
      setStockModal(null);
      fetchProductos();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo mover el stock') });
    } finally {
      setModalSaving(false);
    }
  };

  const pasarTodoAlSalon = async (p) => {
    cerrarDropdown();
    if (pasarTodoSaving) return;
    const variantes = (p.variantes || []).filter((v) => (v.deposito || 0) > 0);
    const total = p.variantes?.length > 0
      ? variantes.reduce((s, v) => s + (v.deposito || 0), 0)
      : (p.deposito || 0);
    if (total <= 0) {
      toast({ message: 'No hay stock en depósito para pasar' });
      return;
    }
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Pasar todo al salón?',
      message: `Se pasarán ${total} unidad(es) de "${p.nombre}" del depósito al salón.`,
      confirmText: 'Pasar todo',
    });
    if (!confirmed) return;
    setPasarTodoSaving(true);
    try {
      const items = p.variantes?.length > 0
        ? variantes.map((v) => ({ producto: p._id, cantidad: v.deposito, talle: v.talle || '', color: v.color || '' }))
        : [{ producto: p._id, cantidad: total, talle: '', color: '' }];
      await pasarSalon(items);
      fetchProductos();
      toast({ message: `Pasado al salón: ${total} u.` });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo pasar el stock') });
      fetchProductos();
    } finally {
      setPasarTodoSaving(false);
    }
  };

  const exportarMovimientosCsv = () => {
    if (movimientos.length === 0) {
      toast({ message: 'No hay movimientos para exportar' });
      return;
    }
    const filas = [['Producto', 'Talle', 'Color', 'Tipo', 'Cantidad', 'Empleado', 'Fecha']];
    for (const m of movimientos) {
      filas.push([
        m.productoNombre || '',
        m.talle || '',
        m.color || '',
        TIPOS[m.tipo]?.label || m.tipo || '',
        m.cantidad,
        m.empleado || '',
        m.fechaCreacion ? new Date(m.fechaCreacion).toISOString() : '',
      ]);
    }
    const csv = filas
      .map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-deposito-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtrados = productos.filter((p) => {
    if (soloConStock && depositoTotal(p) <= 0) return false;
    return true;
  });

  const valorDeposito = filtrados.reduce((s, p) => s + depositoTotal(p) * (Number(p.precio) || 0), 0);
  const bajosSalon = filtrados.filter((p) => salonTotal(p) <= (p.stockMinimo ?? 0)).length;

  const badgeSalon = (p) => {
    const total = salonTotal(p);
    if (total === 0) {
      return <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-ios-red/15 text-ios-red">Agotado</span>;
    }
    if (total <= (p.stockMinimo ?? 0)) {
      return <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">Bajo</span>;
    }
    return null;
  };

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
    p.variantes?.length > 0 ? (
      <div className="text-xs text-ios-tertiary space-y-0.5">
        {p.variantes.map((v, i) => (
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

          {productos.length >= LIMITE_PRODUCTOS && (
            <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/25 rounded-ios-control text-amber-400 text-sm font-medium">
              Se muestran los primeros {LIMITE_PRODUCTOS} productos. Usá la búsqueda para encontrar el resto.
            </div>
          )}

          <div className="mb-4 flex items-center gap-4 flex-wrap text-xs text-ios-tertiary">
            <span>
              Valor en depósito: <span className="text-ios-label font-semibold">{formatMoney(valorDeposito)}</span>
            </span>
            {bajosSalon > 0 && (
              <span className="text-amber-400 font-medium">{bajosSalon} producto(s) con stock bajo o agotado en salón</span>
            )}
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
                            {p.variantes?.length > 0 && (
                              <IconChevronDown
                                className={`w-3 h-3 text-ios-tertiary transition-transform ${expandedId === p._id ? 'rotate-180' : ''}`}
                                strokeWidth={2.2}
                              />
                            )}
                            <span className="font-semibold text-ios-label">{p.nombre}</span>
                            {badgeSalon(p)}
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
                        <p className="font-semibold text-ios-label flex items-center gap-1.5 flex-wrap">
                          {p.nombre}
                          {badgeSalon(p)}
                        </p>
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
                    {expandedId === p._id && p.variantes?.length > 0 && (
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
            <IosSearch
              value={movBuscar}
              onChange={setMovBuscar}
              placeholder="Buscar por producto..."
              className="w-full sm:w-72"
            />
            <IosSelect
              value={movTipo}
              onChange={(e) => { setMovTipo(e.target.value); setMovLimit(100); }}
              className="w-full sm:w-56"
            >
              <option value="" className="bg-ios-surface2">Todos los movimientos</option>
              {Object.entries(TIPOS).map(([key, info]) => (
                <option key={key} value={key} className="bg-ios-surface2">{info.label}</option>
              ))}
            </IosSelect>
            <input
              type="date"
              value={movDesde}
              onChange={(e) => { setMovDesde(e.target.value); setMovLimit(100); }}
              className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-label text-sm focus:outline-none focus:ring-2 focus:ring-ios-tint/40"
              aria-label="Desde"
            />
            <input
              type="date"
              value={movHasta}
              onChange={(e) => { setMovHasta(e.target.value); setMovLimit(100); }}
              className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-label text-sm focus:outline-none focus:ring-2 focus:ring-ios-tint/40"
              aria-label="Hasta"
            />
            <button
              onClick={exportarMovimientosCsv}
              className="ios-btn-press px-3.5 py-2 bg-ios-surface2 rounded-ios-pill text-sm text-ios-secondary font-medium hover:bg-ios-surface3 transition-colors"
            >
              Exportar CSV
            </button>
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
            <>
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
                            {variante ? `${variante} · ` : ''}{m.empleado || '—'} · {formatDate(m.fechaCreacion)}
                          </p>
                        </div>
                        <span className="text-ios-label font-bold tabular-nums shrink-0">{m.cantidad} u.</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {movimientos.length >= movLimit && movLimit < 500 && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setMovLimit((n) => Math.min(n + 100, 500))}
                    className="ios-btn-press px-4 py-2.5 bg-ios-surface2 rounded-ios-pill text-sm text-ios-secondary font-medium hover:bg-ios-surface3 transition-colors"
                  >
                    Cargar más movimientos
                  </button>
                </div>
              )}
            </>
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
            {((dropdown.product?.variantes?.length > 0 && dropdown.product.variantes.some((v) => (v.deposito || 0) > 0))
              || (dropdown.product?.variantes?.length === 0 && (dropdown.product?.deposito || 0) > 0)) && (
              <button
                onClick={() => pasarTodoAlSalon(dropdown.product)}
                disabled={pasarTodoSaving}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-green hover:bg-ios-hover/5 rounded-xl transition-colors font-medium disabled:opacity-50"
              >
                <IconArrowUp className="w-4 h-4" />
                Pasar todo al salón
              </button>
            )}
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
                  {stockModal.modo === 'cargar' && (
                    <option value="__nueva__" className="bg-ios-surface2">+ Nueva variante…</option>
                  )}
                </IosSelect>
              </IosField>
            )}

            {modalEsNueva && (
              <div className="grid grid-cols-2 gap-3">
                <IosField label="Talle nuevo">
                  <IosInput
                    type="text"
                    value={modalNuevoTalle}
                    onChange={(e) => setModalNuevoTalle(e.target.value)}
                    placeholder="Ej: XL"
                  />
                </IosField>
                <IosField label="Color nuevo">
                  <IosInput
                    type="text"
                    value={modalNuevoColor}
                    onChange={(e) => setModalNuevoColor(e.target.value)}
                    placeholder="Ej: Azul"
                  />
                </IosField>
              </div>
            )}

            <div className="rounded-2xl px-4 py-3 bg-ios-surface2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-ios-tertiary">En depósito</span>
                <span className="text-ios-label font-semibold tabular-nums">
                  {modalEsNueva ? 0 : modalVariant ? (modalVariant.deposito || 0) : (modalProducto.deposito || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ios-tertiary">En salón</span>
                <span className="text-ios-label font-semibold tabular-nums">
                  {modalEsNueva ? 0 : modalVariant ? (modalVariant.cantidad || 0) : (modalProducto.cantidad || 0)}
                </span>
              </div>
            </div>

            {stockModal.modo === 'cargar' && (
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <span className="text-sm text-ios-secondary font-medium">
                  Fijar cantidad (inventario)
                  <span className="block text-[11px] text-ios-tertiary mt-0.5">
                    Deja el depósito exactamente en la cantidad ingresada.
                  </span>
                </span>
                <IosToggle checked={modalFijar} onChange={setModalFijar} />
              </label>
            )}

            <IosField
              label="Cantidad"
              hint={
                stockModal.modo === 'reponer'
                  ? `Disponible en depósito: ${disponibleModal}`
                  : modalFijar
                    ? 'Se fijará el stock del depósito'
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

            {stockModal.modo === 'cargar' && modalFijar && (
              <p className="text-ios-tertiary text-[11px]">
                Stock actual: {disponibleModal} → nuevo: {Number(modalCantidad) || 0}
                {Number(modalCantidad) !== disponibleModal && (
                  <span className={Number(modalCantidad) > disponibleModal ? 'text-ios-green' : 'text-amber-400'}>
                    {' '}({(Number(modalCantidad) || 0) - disponibleModal > 0 ? '+' : ''}
                    {(Number(modalCantidad) || 0) - disponibleModal})
                  </span>
                )}
              </p>
            )}
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
        <FormularioProducto
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
