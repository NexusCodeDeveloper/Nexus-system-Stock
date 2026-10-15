import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { obtenerProductos, obtenerProducto, obtenerProductoPorCodigo, crearProducto, actualizarProducto, eliminarProducto, addDeposito, reponerStock, pasarSalon, aplicarAumentoMasivo, obtenerAumentos, deshacerAumento } from '../../api/productos';
import { obtenerMovimientosStock } from '../../api/movimientosStock';
import { obtenerPromociones, crearPromocion, cancelarPromocion, eliminarPromocion } from '../../api/promociones';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { printLabel } from '../../utils/printLabel';
import { formatDate, formatMoney } from '../../utils/format';
import { precioVigente, tieneOferta, etiquetaOferta } from '../../utils/precios';
import { depositoTotal, salonTotal, variantLabel, paramsProductos } from '../../utils/productos';
import { calcularPagina } from '../../utils/paginacion';
import { useApi } from '../../hooks/useApi';
import { useCategorias } from '../../hooks/useCategorias';
import { useDropdownAnclado } from '../../hooks/useDropdownAnclado';
import { escucharPush } from '../../services/GestorPush';
import { getItem, setItem } from '../../utils/storage';
import { useAutenticacion } from '../../context/autenticacionContexto';
import { useLector } from '../../context/lectorContexto';
import { useIosAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import IosToggle from '../../components/ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../../components/ui/IosForm';
import FormularioProducto from '../../components/FormularioProducto/FormularioProducto';
import FiltroCategorias from '../../components/FiltroCategorias/FiltroCategorias';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Paginacion from '../../components/common/Paginacion';
import AvisoPromociones from '../../components/Promociones/AvisoPromociones';
import { IconArrowUp, IconChevronDown, IconHistory, IconPencil, IconPlus, IconPrint, IconRefresh, IconTrash, IconWarehouse, IconTag, IconCheck, IconClock } from '../../components/ui/icons';

const TIPOS = {
  ingreso_deposito: { label: 'Ingreso a depósito', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  ajuste_deposito: { label: 'Ajuste de depósito', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
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

const ESTADOS_PROMO = {
  activa: { label: 'Activa', cls: 'text-ios-green bg-ios-green/10' },
  programada: { label: 'Programada', cls: 'text-ios-tint bg-ios-tint/10' },
  vencida: { label: 'Vencida', cls: 'text-ios-tertiary bg-ios-surface3' },
  cancelada: { label: 'Cancelada', cls: 'text-ios-red bg-ios-red/10' },
};

const isoLocalParaInput = (fecha) => {
  const d = new Date(fecha);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const avisarPromosActualizadas = () => window.dispatchEvent(new CustomEvent('promosActualizadas'));

const calcularPrecioConAumento = (precio, tipo, valor) => {
  const centavos = Math.round((Number(precio) || 0) * 100);
  const nuevo = tipo === 'porcentaje'
    ? Math.round(centavos * (1 + valor / 100))
    : centavos + Math.round((Number(valor) || 0) * 100);
  return nuevo / 100;
};

const ABANICO_TILTS = [
  { rot: 8, dy: 6 },
  { rot: -5, dy: -3 },
  { rot: 12, dy: 5 },
  { rot: -2, dy: -2 },
  { rot: -9, dy: 4 },
  { rot: 4, dy: -4 },
];

const Deposito = () => {
  const { esAdmin } = useAutenticacion();
  const { show: alert, confirm, toast } = useIosAlert();
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState('stock');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [soloConStock, setSoloConStock] = useState(false);
  const [stockPagina, setStockPagina] = useState(1);
  const [stockPorPagina, setStockPorPagina] = useState(25);
  const [expandedId, setExpandedId] = useState(null);
  const [resaltadoId, setResaltadoId] = useState(null);
  const [pendienteMenu, setPendienteMenu] = useState(null);
  const ultimoEscaneoRef = useRef({ codigo: '', ts: 0 });
  const { dropdown, menuRef: dropdownRef, toggle: openDropdown, close: cerrarDropdown } = useDropdownAnclado();

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
  const [etiquetaVariantIdx, setEtiquetaVariantIdx] = useState('');
  const [etiquetaModo, setEtiquetaModo] = useState('etiqueta');
  const [etiquetaGuias, setEtiquetaGuias] = useState(true);
  const [etiquetaMedida, setEtiquetaMedida] = useState('60x40');
  const [etiquetaAncho, setEtiquetaAncho] = useState('60');
  const [etiquetaAlto, setEtiquetaAlto] = useState('40');
  const [etiquetaPrecio, setEtiquetaPrecio] = useState(true);
  const [etiquetaQr, setEtiquetaQr] = useState(true);
  const [etiquetaSaving, setEtiquetaSaving] = useState(false);

  const [movTipo, setMovTipo] = useState('');
  const [movBuscar, setMovBuscar] = useState('');
  const [movBuscarDebounced, setMovBuscarDebounced] = useState('');
  const [movDesde, setMovDesde] = useState('');
  const [movHasta, setMovHasta] = useState('');
  const [movLimit, setMovLimit] = useState(100);
  const [pasarTodoSaving, setPasarTodoSaving] = useState(false);

  const [flujoSeleccion, setFlujoSeleccion] = useState(null);
  const [abanicoAbierto, setAbanicoAbierto] = useState(false);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [todosSel, setTodosSel] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [showGestion, setShowGestion] = useState(false);
  const [gestionTab, setGestionTab] = useState('ofertas');
  const [showAumento, setShowAumento] = useState(false);
  const [aumentoSaving, setAumentoSaving] = useState(false);
  const [aumentoForm, setAumentoForm] = useState({ tipo: 'porcentaje', valor: '' });
  const [previewProductos, setPreviewProductos] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [aumentos, setAumentos] = useState([]);
  const [aumentosLoading, setAumentosLoading] = useState(false);
  const [aumentosError, setAumentosError] = useState('');
  const [deshaciendoId, setDeshaciendoId] = useState(null);
  const [promociones, setPromociones] = useState([]);
  const [promocionesLoading, setPromocionesLoading] = useState(false);
  const [promocionesError, setPromocionesError] = useState('');
  const [promoForm, setPromoForm] = useState({
    nombre: '',
    tipo: 'porcentaje',
    valor: '',
    desde: '',
    hasta: '',
    todos: false,
  });

  const { categorias, recargarCategorias } = useCategorias();
  const productosApi = useApi(
    async () => {
      const res = await obtenerProductos({
        ...paramsProductos({ search: searchDebounced, categoria: categoriaActiva }),
        soloDeposito: soloConStock ? 1 : undefined,
        offset: (stockPagina - 1) * stockPorPagina,
        limit: stockPorPagina,
        conTotal: 1,
        conMetricas: 1,
      });
      const lista = Array.isArray(res.data?.productos) ? res.data.productos : [];
      return {
        lista,
        total: Number(res.data?.total) || 0,
        metricas: res.data?.metricas || { valorDeposito: 0, bajosSalon: 0 },
      };
    },
    { deps: [searchDebounced, categoriaActiva, soloConStock, stockPagina, stockPorPagina], mensajeError: 'Error al cargar productos' }
  );

  const movimientosApi = useApi(
    async () => {
      const params = { limit: movLimit };
      if (movTipo) params.tipo = movTipo;
      if (movBuscarDebounced.trim()) params.buscar = movBuscarDebounced.trim();
      if (movDesde) params.desde = movDesde;
      if (movHasta) params.hasta = movHasta;
      if (movDesde || movHasta) params.tz = new Date().getTimezoneOffset();
      const res = await obtenerMovimientosStock(params);
      const lista = Array.isArray(res.data) ? res.data : [];
      return { lista, hayMas: lista.length >= movLimit };
    },
    { auto: false, mensajeError: 'Error al cargar movimientos' }
  );

  const { run: recargarProductos, loading, error } = productosApi;
  const { run: recargarMovimientos, loading: movLoading, error: movError } = movimientosApi;
  const productos = productosApi.error ? [] : productosApi.data?.lista || [];
  const totalProductos = productosApi.error ? 0 : productosApi.data?.total || 0;
  const metricas = productosApi.data?.metricas || { valorDeposito: 0, bajosSalon: 0 };
  const { totalPaginas } = calcularPagina(totalProductos, stockPorPagina, stockPagina);
  const movimientos = movimientosApi.error ? [] : movimientosApi.data?.lista || [];
  const movHayMas = !movimientosApi.error && Boolean(movimientosApi.data?.hayMas);

  useEffect(() => {
    const off = escucharPush((payload) => {
      if (['stock', 'venta', 'devolucion'].includes(payload?.tipo)) {
        recargarProductos();
        if (tab === 'movimientos') recargarMovimientos();
      }
    });
    return off;
  }, [recargarProductos, recargarMovimientos, tab]);

  const manejarCodigoEscaneado = async (codigo) => {
    const ahora = Date.now();
    if (codigo === ultimoEscaneoRef.current.codigo && ahora - ultimoEscaneoRef.current.ts < 800) return;
    ultimoEscaneoRef.current = { codigo, ts: ahora };
    try {
      const { data: producto } = await obtenerProductoPorCodigo(codigo);
      setTab('stock');
      setCategoriaActiva('');
      setSoloConStock(false);
      setSearch(codigo);
      setPendienteMenu({ id: producto._id });
      const variante = [producto.variante?.talle, producto.variante?.color].filter(Boolean).join(' / ');
      toast({
        message: `Producto: ${producto.nombre}${variante ? ` (${variante})` : ''} · Salón ${salonTotal(producto)} · Dep ${depositoTotal(producto)}`,
        duration: 2400,
      });
    } catch (err) {
      if (err.response?.status === 410 || err.response?.data?.code === 'EN_PAPELERA') {
        toast({ message: err.response?.data?.message || 'El producto está en la papelera.', duration: 3200 });
        return;
      }
      if (err.response?.status === 404) {
        if (!esAdmin) {
          toast({ message: `No existe un producto con el código "${codigo}".`, duration: 3200 });
          return;
        }
        const crear = await confirm({
          icon: 'info',
          title: 'Código no encontrado',
          message: `No existe un producto con el código "${codigo}". ¿Querés crearlo?`,
          confirmText: 'Crear producto',
        });
        if (crear) {
          setEditing(null);
          setShowForm(true);
        }
        return;
      }
      toast({ message: obtenerMensajeErrorApi(err, 'Error al buscar el código') });
    }
  };

  useLector(manejarCodigoEscaneado, !stockModal && !etiquetaModal && !showForm && !dropdown.product);

  useEffect(() => {
    if (!pendienteMenu) return;
    const boton = [...document.querySelectorAll(`[data-acciones-producto="${pendienteMenu.id}"]`)]
      .find((el) => el.offsetParent !== null);
    if (!boton) return;
    setResaltadoId(pendienteMenu.id);
    setPendienteMenu(null);
    boton.click();
  }, [pendienteMenu, productosApi.data]);

  useEffect(() => {
    if (!resaltadoId) return undefined;
    const visibles = [...document.querySelectorAll('[data-item-resaltado="true"]')];
    visibles.find((el) => el.offsetParent !== null)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setResaltadoId(null), 3200);
    return () => clearTimeout(timer);
  }, [resaltadoId]);

  const handleGuardar = async (data) => {
    if (isSubmitting) return;
    if (editing) {
      const ok = await confirm({
        icon: 'warning',
        title: '¿Guardar cambios del producto?',
        message: `Se van a sobrescribir los datos guardados de "${editing.nombre}". Las ventas ya realizadas no se actualizan: los cambios se aplican solo a las futuras ventas.`,
        confirmText: 'Guardar',
      });
      if (!ok) return;
    }
    setIsSubmitting(true);
    try {
      if (editing) {
        await actualizarProducto(editing._id, data);
      } else {
        await crearProducto(data);
      }
      setShowForm(false);
      setEditing(null);
      recargarProductos();
      recargarCategorias();
      toast({ message: editing ? 'Producto actualizado' : 'Producto creado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al guardar producto') });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setStockPagina(1);
  }, [searchDebounced, categoriaActiva, soloConStock]);

  useEffect(() => {
    if (stockPagina > totalPaginas) setStockPagina(totalPaginas);
  }, [stockPagina, totalPaginas]);

  useEffect(() => {
    setTodosSel(false);
  }, [searchDebounced, categoriaActiva, soloConStock]);

  useEffect(() => {
    const timer = setTimeout(() => setMovBuscarDebounced(movBuscar), movBuscar.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [movBuscar]);

  useEffect(() => {
    if (location.state?.crear) {
      setEditing(null);
      setShowForm(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (tab !== 'movimientos' || !esAdmin) return undefined;
    recargarMovimientos();
    return undefined;
  }, [tab, movTipo, movBuscarDebounced, movDesde, movHasta, movLimit, esAdmin, recargarMovimientos]);

  const handleDelete = async (p) => {
    cerrarDropdown();
    let ventas = 0;
    try {
      const { data } = await obtenerProducto(p._id);
      ventas = Number(data?.uso?.ventas) || 0;
    } catch {
      /* si no se pudo consultar, se muestra el aviso igual */
    }
    const confirmed = await confirm({
      icon: 'warning',
      title: `¿Eliminar "${p.nombre}"?`,
      message: `El producto se mueve a la Papelera y se oculta del catálogo y de las ventas.${ventas > 0 ? ` Tiene ${ventas} venta(s) registrada(s).` : ''} Las ventas y tickets ya emitidos NO se actualizan: el historial queda como está y los cambios aplican solo a futuras ventas. Podés restaurarlo desde la Papelera.`,
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarProducto(p._id);
      recargarProductos();
      recargarCategorias();
      toast({ message: 'Producto movido a la Papelera' });
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
    setEtiquetaVariantIdx(p.variantes?.length === 1 ? '0' : '');
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

    const variantes = etiquetaModal.variantes || [];
    let codigoEtiqueta = etiquetaModal.codigo;
    let varianteTexto = '';
    if (variantes.length > 0) {
      if (etiquetaVariantIdx === '') {
        alert({ icon: 'warning', title: 'Campo requerido', message: 'Elegí la variante a imprimir' });
        return;
      }
      const variante = variantes[Number(etiquetaVariantIdx)];
      if (!variante?.codigo) {
        alert({
          icon: 'warning',
          title: 'Variante sin código',
          message: 'Guardá el producto para generar los códigos de sus variantes e intentá de nuevo',
        });
        return;
      }
      codigoEtiqueta = variante.codigo;
      varianteTexto = [variante.talle, variante.color].filter(Boolean).join(' / ');
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
        codigo: codigoEtiqueta,
        varianteTexto,
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
    if (esFijar && cantidad === disponibleModal) {
      toast({ message: 'Sin cambios en el depósito' });
      setStockModal(null);
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
      recargarProductos();
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
      recargarProductos();
      toast({ message: `Pasado al salón: ${total} u.` });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo pasar el stock') });
      recargarProductos();
    } finally {
      setPasarTodoSaving(false);
    }
  };

  const exportarMovimientosCsv = async () => {
    if (movimientos.length === 0) {
      toast({ message: 'No hay movimientos para exportar' });
      return;
    }
    let lista = movimientos;
    try {
      const params = { limit: 500 };
      if (movTipo) params.tipo = movTipo;
      if (movBuscar.trim()) params.buscar = movBuscar.trim();
      if (movDesde) params.desde = movDesde;
      if (movHasta) params.hasta = movHasta;
      if (movDesde || movHasta) params.tz = new Date().getTimezoneOffset();
      const res = await obtenerMovimientosStock(params);
      if (Array.isArray(res.data)) lista = res.data;
    } catch {
      /* si falla, se exporta lo que ya está en pantalla */
    }
    const filas = [['Producto', 'Talle', 'Color', 'Tipo', 'Cantidad', 'Empleado', 'Fecha']];
    for (const m of lista) {
      filas.push([
        m.productoNombre || '',
        m.talle || '',
        m.color || '',
        TIPOS[m.tipo]?.label || m.tipo || '',
        m.cantidad,
        m.empleado || '',
        formatDate(m.fechaCreacion),
      ]);
    }
    const csv = filas
      .map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-deposito-${new Date().toLocaleDateString('sv-SE')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (lista.length >= 500) {
      toast({ message: 'Se exportaron los primeros 500 movimientos. Acotá las fechas para el resto.' });
    }
  };

  const valorDeposito = metricas.valorDeposito;
  const bajosSalon = metricas.bajosSalon;

  const badgeSalon = (p) => {
    const minimo = p.stockMinimo ?? 0;
    const variantes = p.variantes || [];
    const cantidades = variantes.length > 0 ? variantes.map((v) => Number(v.cantidad) || 0) : [salonTotal(p)];
    if (cantidades.some((c) => c === 0)) {
      return <span className="inline-flex items-center justify-center leading-none px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-ios-red/15 text-ios-red">Agotado</span>;
    }
    if (cantidades.some((c) => c <= minimo)) {
      return <span className="inline-flex items-center justify-center leading-none px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">Bajo</span>;
    }
    return null;
  };

  const botonAcciones = (p) => (
    <button
      onClick={(e) => openDropdown(e, p)}
      data-acciones-producto={p._id}
      className="p-2 btn-icono btn-icono-gris"
      aria-label="Acciones del producto"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
      </svg>
    </button>
  );

  const detalleVariantes = (p) =>
    p.variantes?.length > 0 ? (
      <div className="text-xs text-ios-tertiary grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5">Detalle</p>
          <div className="space-y-0.5">
            {p.variantes.map((v, i) => (
              <div key={i} className="text-ios-secondary">{variantLabel(v)} ({v.cantidad || 0})</div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5">Código</p>
          <div className="space-y-0.5">
            {p.variantes.map((v, i) => (
              <div key={i} className="tabular-nums">{v.codigo || 'sin código'}</div>
            ))}
          </div>
        </div>
      </div>
    ) : null;

  const todosSeleccionados = todosSel;

  const toggleSeleccion = (id) => {
    const estaba = seleccionados.has(id);
    setSeleccionados((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
    if (estaba) setTodosSel(false);
  };

  const toggleTodos = async () => {
    if (todosSel) {
      setSeleccionados(new Set());
      setTodosSel(false);
      return;
    }
    try {
      const res = await obtenerProductos({
        ...paramsProductos({ search: searchDebounced, categoria: categoriaActiva }),
        soloDeposito: soloConStock ? 1 : undefined,
        soloIds: 1,
      });
      const ids = Array.isArray(res.data?.ids) ? res.data.ids : [];
      setSeleccionados(new Set(ids));
      setTodosSel(ids.length > 0);
    } catch (err) {
      alert({
        icon: 'error',
        title: 'Error',
        message: obtenerMensajeErrorApi(err, 'No se pudieron seleccionar los productos'),
      });
    }
  };

  const salirModoSeleccion = () => {
    setFlujoSeleccion(null);
    setSeleccionados(new Set());
    setTodosSel(false);
  };

  const iniciarSeleccion = (flujo) => {
    setTab('stock');
    if (flujoSeleccion !== flujo) {
      setSeleccionados(new Set());
      setTodosSel(false);
    }
    setFlujoSeleccion(flujo);
    setAbanicoAbierto(false);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    toast({
      message: flujo === 'aumento'
        ? 'Tildá los productos y tocá "Aplicar aumento" arriba'
        : 'Tildá los productos y tocá "Aplicar descuento" arriba',
      duration: 3000,
    });
  };

  const abrirPromo = () => {
    const ahora = new Date();
    const fin = new Date(ahora.getTime() + 7 * 86400000);
    fin.setHours(23, 59, 0, 0);
    setPromoForm({
      nombre: '',
      tipo: 'porcentaje',
      valor: '',
      desde: isoLocalParaInput(ahora),
      hasta: isoLocalParaInput(fin),
      todos: false,
    });
    setShowPromo(true);
  };

  const guardarPromo = async () => {
    if (promoSaving) return;
    if (!promoForm.todos && seleccionados.size === 0) {
      alert({ icon: 'warning', title: 'Sin productos', message: 'Seleccioná al menos un producto o aplicá a todos' });
      return;
    }
    const valor = Number(promoForm.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      alert({ icon: 'warning', title: 'Descuento inválido', message: 'El descuento debe ser mayor a 0' });
      return;
    }
    if (promoForm.tipo === 'porcentaje' && valor > 100) {
      alert({ icon: 'warning', title: 'Porcentaje inválido', message: 'El porcentaje no puede superar el 100%' });
      return;
    }
    const desde = new Date(promoForm.desde);
    const hasta = new Date(promoForm.hasta);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta <= desde) {
      alert({ icon: 'warning', title: 'Fechas inválidas', message: 'La fecha de fin debe ser posterior a la de inicio' });
      return;
    }
    setPromoSaving(true);
    try {
      await crearPromocion({
        nombre: promoForm.nombre.trim(),
        tipo: promoForm.tipo,
        valor,
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        todos: promoForm.todos,
        productos: promoForm.todos ? [] : [...seleccionados],
      });
      toast({ message: 'Promoción creada' });
      setShowPromo(false);
      salirModoSeleccion();
      recargarProductos();
      avisarPromosActualizadas();
    } catch (err) {
      alert({ icon: 'error', title: 'No se pudo crear', message: obtenerMensajeErrorApi(err, 'Error al crear la promoción') });
    } finally {
      setPromoSaving(false);
    }
  };

  const cargarPromociones = async () => {
    setPromocionesLoading(true);
    setPromocionesError('');
    try {
      const res = await obtenerPromociones();
      setPromociones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setPromocionesError(obtenerMensajeErrorApi(err, 'Error al cargar las promociones'));
    } finally {
      setPromocionesLoading(false);
    }
  };

  const cargarAumentos = async () => {
    setAumentosLoading(true);
    setAumentosError('');
    try {
      const res = await obtenerAumentos({ limit: 50 });
      setAumentos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setAumentosError(obtenerMensajeErrorApi(err, 'Error al cargar el historial de aumentos'));
    } finally {
      setAumentosLoading(false);
    }
  };

  const abrirGestion = (tab = 'ofertas') => {
    setShowGestion(true);
    setGestionTab(tab);
    if (tab === 'aumentos') cargarAumentos();
    else cargarPromociones();
  };

  const cambiarTabGestion = (tab) => {
    if (tab === gestionTab) return;
    setGestionTab(tab);
    if (tab === 'aumentos') cargarAumentos();
    else cargarPromociones();
  };

  const cancelarPromo = async (promo) => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Cancelar la promoción?',
      message: 'Los productos vuelven al precio normal al instante.',
      confirmText: 'Cancelar promoción',
      destructive: true,
    });
    if (!ok) return;
    try {
      await cancelarPromocion(promo._id);
      toast({ message: 'Promoción cancelada' });
      cargarPromociones();
      recargarProductos();
      avisarPromosActualizadas();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al cancelar la promoción') });
    }
  };

  const eliminarPromo = async (promo) => {
    const vigente = promo.estado === 'activa' || promo.estado === 'programada';
    const ok = await confirm({
      icon: 'warning',
      title: '¿Eliminar esta promoción?',
      message: vigente
        ? 'Se elimina del historial y los productos vuelven al precio normal al instante. Esta acción no se puede deshacer.'
        : 'Se elimina del historial. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    try {
      await eliminarPromocion(promo._id);
      toast({ message: 'Promoción eliminada' });
      cargarPromociones();
      recargarProductos();
      avisarPromosActualizadas();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar la promoción') });
    }
  };

  const abrirAumento = async () => {
    setAumentoForm({ tipo: 'porcentaje', valor: '' });
    setShowAumento(true);
    setPreviewLoading(true);
    try {
      const res = await obtenerProductos({
        ...paramsProductos({ search: searchDebounced, categoria: categoriaActiva }),
        limit: 2000,
      });
      setPreviewProductos(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPreviewProductos([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const valorAumento = Number(aumentoForm.valor);

  const previewSeleccion = useMemo(() => {
    if (!showAumento || seleccionados.size === 0 || !Number.isFinite(valorAumento) || valorAumento <= 0) {
      return [];
    }
    const porId = new Map(previewProductos.map((p) => [String(p._id), p]));
    const filas = [];
    for (const id of seleccionados) {
      const p = porId.get(String(id));
      if (!p) continue;
      filas.push({
        id,
        nombre: p.nombre,
        anterior: Number(p.precio) || 0,
        nuevo: calcularPrecioConAumento(p.precio, aumentoForm.tipo, valorAumento),
        oferta: tieneOferta(p),
      });
    }
    return filas;
  }, [showAumento, seleccionados, previewProductos, aumentoForm.tipo, valorAumento]);

  const previewFaltantes = seleccionados.size - previewSeleccion.length;
  const previewOfertas = previewSeleccion.filter((fila) => fila.oferta).length;

  const guardarAumento = async () => {
    if (aumentoSaving) return;
    if (seleccionados.size === 0) {
      alert({ icon: 'warning', title: 'Sin productos', message: 'Seleccioná al menos un producto para aplicar el aumento' });
      return;
    }
    const valor = Number(aumentoForm.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      alert({ icon: 'warning', title: 'Aumento inválido', message: 'El aumento debe ser mayor a 0' });
      return;
    }
    if (aumentoForm.tipo === 'porcentaje' && valor > 10000) {
      alert({ icon: 'warning', title: 'Porcentaje inválido', message: 'El porcentaje no puede superar el 10000%' });
      return;
    }
    const ok = await confirm({
      icon: 'warning',
      title: '¿Aplicar el aumento?',
      message: `Se van a subir los precios de ${seleccionados.size} producto${seleccionados.size === 1 ? '' : 's'} ${
        aumentoForm.tipo === 'porcentaje' ? `un ${valor}%` : `${formatMoney(valor)} a cada uno`
      }. Podés deshacerlo desde el historial de aumentos.`,
      confirmText: 'Aplicar aumento',
    });
    if (!ok) return;
    setAumentoSaving(true);
    try {
      const res = await aplicarAumentoMasivo({
        tipo: aumentoForm.tipo,
        valor,
        productos: [...seleccionados],
      });
      toast({ message: res.data?.message || 'Precios actualizados' });
      setShowAumento(false);
      salirModoSeleccion();
      recargarProductos();
    } catch (err) {
      alert({ icon: 'error', title: 'No se pudo aplicar', message: obtenerMensajeErrorApi(err, 'Error al aplicar el aumento') });
    } finally {
      setAumentoSaving(false);
    }
  };

  const confirmarDeshacer = async (aumento) => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Deshacer este aumento?',
      message: `Se restauran los precios anteriores de hasta ${aumento.cantidad} producto(s). Los que hayan cambiado de precio después quedan como están.`,
      confirmText: 'Deshacer',
      destructive: true,
    });
    if (!ok) return;
    setDeshaciendoId(aumento._id);
    try {
      const res = await deshacerAumento(aumento._id);
      toast({ message: res.data?.message || 'Precios restaurados' });
      cargarAumentos();
      recargarProductos();
    } catch (err) {
      alert({ icon: 'error', title: 'No se pudo deshacer', message: obtenerMensajeErrorApi(err, 'Error al deshacer el aumento') });
    } finally {
      setDeshaciendoId(null);
    }
  };

  const irASeleccionAumento = () => {
    setShowGestion(false);
    setShowAumento(false);
    iniciarSeleccion('aumento');
  };

  const accionesDeposito = [
    esAdmin && {
      key: 'nuevo',
      label: 'Nuevo Producto',
      icono: IconPlus,
      variant: 'primary',
      face: 'bg-gradient-to-b from-[#2E9BFF] to-[#0A6CFF]',
      glow: 'hover:shadow-[0_12px_30px_-8px_rgba(14,140,255,0.65)]',
      onClick: () => { setEditing(null); setShowForm(true); },
    },
    esAdmin && {
      key: 'gestion',
      label: 'Ofertas y aumentos',
      icono: IconTag,
      variant: 'gray',
      face: 'bg-gradient-to-b from-[#A855F7] to-[#7C3AED]',
      glow: 'hover:shadow-[0_12px_30px_-8px_rgba(168,85,247,0.65)]',
      onClick: () => abrirGestion('ofertas'),
    },
    esAdmin && tab === 'stock' && flujoSeleccion === null && {
      key: 'aumento',
      label: 'Aumentar precios',
      icono: IconArrowUp,
      variant: 'tinted',
      face: 'bg-gradient-to-b from-[#34D399] to-[#059669]',
      glow: 'hover:shadow-[0_12px_30px_-8px_rgba(16,185,129,0.65)]',
      onClick: () => iniciarSeleccion('aumento'),
    },
    esAdmin && tab === 'stock' && flujoSeleccion === null && {
      key: 'descuento',
      label: 'Descuentos',
      icono: IconTag,
      variant: 'tinted',
      face: 'bg-gradient-to-b from-[#FBBF24] to-[#F97316]',
      glow: 'hover:shadow-[0_12px_30px_-8px_rgba(249,115,22,0.65)]',
      onClick: () => iniciarSeleccion('descuento'),
    },
    {
      key: 'actualizar',
      label: 'Actualizar',
      icono: IconRefresh,
      variant: 'gray',
      face: 'bg-gradient-to-b from-[#94A3B8] to-[#64748B]',
      glow: 'hover:shadow-[0_12px_30px_-8px_rgba(100,116,139,0.6)]',
      onClick: () => (tab === 'stock' ? recargarProductos() : recargarMovimientos()),
    },
  ].filter(Boolean);

  const checkFlujoCls = (activo) =>
    activo
      ? (flujoSeleccion === 'aumento'
          ? 'bg-ios-green border-ios-green text-white'
          : 'bg-ios-orange border-ios-orange text-white')
      : 'border-ios-separator text-transparent';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Depósito General</h1>
        </div>
        {accionesDeposito.length > 1 ? (
          <>
            <div
              className="relative z-40 hidden lg:flex flex-row-reverse items-center justify-start w-[132px] h-[68px] shrink-0"
              onMouseEnter={() => setAbanicoAbierto(true)}
              onMouseLeave={() => setAbanicoAbierto(false)}
              onFocus={() => setAbanicoAbierto(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setAbanicoAbierto(false);
              }}
            >
              {accionesDeposito.map((accion, i) => {
                const tilt = ABANICO_TILTS[i % ABANICO_TILTS.length];
                const Icono = accion.icono;
                return (
                  <div
                    key={accion.key}
                    className={`carta-pulso transition-all duration-300 ease-out ${abanicoAbierto ? 'mr-1.5' : (i === 0 ? '' : '-mr-9')}`}
                    style={{
                      transform: `translateY(${abanicoAbierto ? 0 : tilt.dy}px) rotate(${abanicoAbierto ? 0 : tilt.rot}deg)`,
                      zIndex: accionesDeposito.length - i,
                      '--pulso-delay': `${i * 1.3}s`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={accion.onClick}
                      title={accion.label}
                      aria-label={accion.label}
                      className={`animate-card-deal whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-ios-pill px-3 py-1.5 text-[13px] font-semibold select-none text-white ring-1 ring-white/25 transition-all duration-150 active:scale-[0.97] active:opacity-90 hover:-translate-y-1 ${accion.face} ${accion.glow}`}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <Icono className="w-[18px] h-[18px] shrink-0" />
                      <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${abanicoAbierto ? 'max-w-[170px] opacity-100' : 'max-w-0 opacity-0'}`}>
                        {accion.label}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex lg:hidden items-center gap-2 flex-wrap">
              {accionesDeposito.map((accion) => {
                const Icono = accion.icono;
                return (
                  <button
                    key={accion.key}
                    type="button"
                    onClick={accion.onClick}
                    className={`btn-vivo inline-flex items-center justify-center gap-2 rounded-ios-pill px-4 py-2.5 text-sm font-semibold text-white ${accion.face} ${accion.glow}`}
                  >
                    <Icono className="w-4 h-4" />
                    {accion.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {accionesDeposito.map((accion) => {
              const Icono = accion.icono;
              return (
                <IosButton key={accion.key} variant={accion.variant} onClick={accion.onClick}>
                  <Icono className="w-4 h-4" />
                  {accion.label}
                </IosButton>
              );
            })}
          </div>
        )}
      </div>

      <AvisoPromociones onExpirar={recargarProductos} className="mb-4" />

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('stock')}
          className={`px-4 py-2 rounded-ios-pill text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
            tab === 'stock' ? 'btn-vivo btn-vivo-azul' : 'btn-vivo btn-vivo-gris'
          }`}
        >
          Stock
        </button>
        {esAdmin && (
          <button
            onClick={() => setTab('movimientos')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-ios-pill text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
              tab === 'movimientos' ? 'btn-vivo btn-vivo-azul' : 'btn-vivo btn-vivo-gris'
            }`}
          >
            <IconHistory className="w-4 h-4" />
            Movimientos
          </button>
        )}
      </div>

      {tab === 'stock' && (
        <>
          {flujoSeleccion && (
            <div
              className={`sticky top-0 z-30 mb-4 rounded-2xl border px-3.5 py-3 shadow-ios-card backdrop-blur-2xl animate-slideDown ${
                flujoSeleccion === 'aumento'
                  ? 'border-ios-green/40 bg-ios-green/10'
                  : 'border-ios-orange/40 bg-ios-orange/10'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                <span className={`flex items-center gap-2 font-bold text-sm ${flujoSeleccion === 'aumento' ? 'text-ios-green' : 'text-ios-orange'}`}>
                  {flujoSeleccion === 'aumento'
                    ? <IconArrowUp className="w-4 h-4 shrink-0" />
                    : <IconTag className="w-4 h-4 shrink-0" />}
                  {flujoSeleccion === 'aumento' ? 'Modo aumento' : 'Modo descuento'}
                </span>
                <span className="text-xs text-ios-secondary">
                  Tildá los productos de la lista y tocá el botón para aplicar
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={toggleTodos}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-ios-control bg-ios-surface3 text-ios-secondary text-xs font-semibold hover:bg-ios-separator/40 dark:bg-ios-surface2 dark:hover:bg-ios-surface3 transition-colors"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${checkFlujoCls(todosSeleccionados)}`}>
                      <IconCheck className="w-3 h-3" strokeWidth={3} />
                    </span>
                    {todosSeleccionados ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                  <span className="text-xs text-ios-secondary font-semibold tabular-nums">
                    {seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}
                  </span>
                  {flujoSeleccion === 'aumento' ? (
                    <button
                      type="button"
                      onClick={abrirAumento}
                      disabled={seleccionados.size === 0}
                      title={seleccionados.size === 0 ? 'Tildá al menos un producto' : undefined}
                      className="btn-vivo btn-vivo-verde inline-flex items-center justify-center gap-2 rounded-ios-pill px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <IconArrowUp className="w-4 h-4" /> Aplicar aumento
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={abrirPromo}
                      className="btn-vivo btn-vivo-naranja inline-flex items-center justify-center gap-2 rounded-ios-pill px-3 py-1.5 text-[13px] font-semibold"
                    >
                      <IconTag className="w-4 h-4" /> Aplicar descuento
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={salirModoSeleccion}
                    className="btn-vivo btn-vivo-gris px-3 py-1.5 rounded-ios-control text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {flujoSeleccion === 'aumento' && seleccionados.size === 0 && (
                <p className="text-[11px] text-ios-tertiary mt-2">Tildá al menos un producto para aplicar el aumento.</p>
              )}
            </div>
          )}
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <IosSearch
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre, categoría o código..."
              className="w-full md:w-96"
            />
            <button
              onClick={() => setSoloConStock(!soloConStock)}
              className={`px-3.5 py-2 rounded-ios-pill text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
                soloConStock
                  ? 'btn-vivo btn-vivo-violeta font-semibold'
                  : 'btn-vivo btn-vivo-gris'
              }`}
            >
              Solo con depósito
            </button>
          </div>

          <FiltroCategorias
            categorias={categorias}
            activa={categoriaActiva}
            onChange={setCategoriaActiva}
            className="mb-4"
          />

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
          ) : productos.length === 0 ? (
            <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl py-14 flex flex-col items-center shadow-ios-card">
              <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center mb-4 border border-ios-separator/40">
                <IconWarehouse className="w-7 h-7 text-ios-tertiary" strokeWidth={1.5} />
              </div>
              <p className="text-ios-tertiary text-sm">
                {soloConStock
                  ? 'No hay productos con stock en depósito'
                  : categoriaActiva
                    ? `No hay productos en "${categoriaActiva}"`
                    : 'No hay productos'}
              </p>
              {(categoriaActiva || search) && (
                <button
                  type="button"
                  onClick={() => { setCategoriaActiva(''); setSearch(''); }}
                  className="mt-3 text-ios-tint text-xs font-semibold hover:underline"
                >
                  Ver todos los productos
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-ios-surface rounded-3xl overflow-hidden shadow-ios-card border border-ios-separator/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {flujoSeleccion && (
                        <th className="w-10 px-4 py-3">
                          <button
                            type="button"
                            onClick={toggleTodos}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                              checkFlujoCls(todosSeleccionados)
                            }`}
                            aria-label="Seleccionar todos"
                          >
                            <IconCheck className="w-3.5 h-3.5" strokeWidth={3} />
                          </button>
                        </th>
                      )}
                      <th className="text-left px-5 py-3 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Producto</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Código</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Precio</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Depósito</th>
                      <th className="text-left px-4 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Salón</th>
                      <th className="text-right px-5 py-3.5 text-ios-tertiary font-semibold uppercase tracking-wider text-[11px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr
                        key={p._id}
                        data-item-resaltado={resaltadoId === p._id ? 'true' : undefined}
                        onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                        className={`border-t border-ios-separator/30 transition-all duration-500 hover:bg-ios-hover/[0.03] cursor-pointer ${
                          resaltadoId === p._id ? 'bg-ios-green/10 animate-ios-scan' : ''
                        } ${
                          flujoSeleccion && seleccionados.has(p._id) && resaltadoId !== p._id
                            ? (flujoSeleccion === 'aumento' ? 'bg-ios-green/10' : 'bg-ios-orange/10')
                            : ''
                        }`}
                      >
                        {flujoSeleccion && (
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSeleccion(p._id);
                              }}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                                checkFlujoCls(seleccionados.has(p._id))
                              }`}
                              aria-label={`Seleccionar ${p.nombre}`}
                            >
                              <IconCheck className="w-3.5 h-3.5" strokeWidth={3} />
                            </button>
                          </td>
                        )}
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
                          {p.precio == null ? (
                            <span className="text-ios-tertiary">—</span>
                          ) : tieneOferta(p) ? (
                            <div className="leading-tight">
                              <span className="block text-[11px] text-ios-tertiary line-through">{formatMoney(p.precio)}</span>
                              <span className="text-ios-orange font-semibold">{formatMoney(precioVigente(p))}</span>
                              <span className="ml-1.5 inline-flex items-center justify-center leading-none px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-ios-orange/15 text-ios-orange">
                                {etiquetaOferta(p.oferta)}
                              </span>
                              <span className="block text-[10px] text-ios-tertiary mt-0.5">Hasta {formatDate(p.oferta.hasta)}</span>
                            </div>
                          ) : (
                            <span className="text-ios-secondary tabular-nums">{formatMoney(p.precio)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center justify-center leading-none px-2.5 py-1 rounded-full text-xs font-semibold ${
                            depositoTotal(p) > 0 ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-ios-surface2 text-ios-tertiary'
                          }`}>
                            {depositoTotal(p)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center justify-center leading-none px-2.5 py-1 rounded-full text-xs font-semibold ${
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
                {productos.map((p) => (
                  <div
                    key={p._id}
                    data-item-resaltado={resaltadoId === p._id ? 'true' : undefined}
                    className={`bg-ios-surface border rounded-2xl px-4 py-3.5 shadow-ios-card transition-all duration-500 ${
                      resaltadoId === p._id ? 'border-ios-green/60 ring-2 ring-ios-green/40 bg-ios-green/10 animate-ios-scan' : 'border-ios-separator/30'
                    } ${
                      flujoSeleccion && seleccionados.has(p._id) && resaltadoId !== p._id
                        ? (flujoSeleccion === 'aumento' ? 'bg-ios-green/10 border-ios-green/40' : 'bg-ios-orange/10 border-ios-orange/40')
                        : ''
                    }`}
                  >
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
                          <span className={`inline-flex items-center justify-center leading-none px-2.5 py-1 rounded-full text-xs font-semibold ${
                            depositoTotal(p) > 0 ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-ios-surface2 text-ios-tertiary'
                          }`}>
                            Dep {depositoTotal(p)}
                          </span>
                          <span className={`inline-flex items-center justify-center leading-none px-2.5 py-1 rounded-full text-xs font-semibold ${
                            salonTotal(p) > 0 ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-red/15 text-ios-red'
                          }`}>
                            Salón {salonTotal(p)}
                          </span>
                        </div>
                        {p.precio != null && (
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {tieneOferta(p) ? (
                              <>
                                <span className="text-xs text-ios-tertiary line-through">{formatMoney(p.precio)}</span>
                                <span className="text-sm text-ios-orange font-semibold">{formatMoney(precioVigente(p))}</span>
                                <span className="inline-flex items-center justify-center leading-none px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-ios-orange/15 text-ios-orange">
                                  {etiquetaOferta(p.oferta)}
                                </span>
                                <span className="text-[10px] text-ios-tertiary">Hasta {formatDate(p.oferta.hasta)}</span>
                              </>
                            ) : (
                              <span className="text-xs text-ios-secondary">{formatMoney(p.precio)}</span>
                            )}
                          </div>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {flujoSeleccion && (
                          <button
                            type="button"
                            onClick={() => toggleSeleccion(p._id)}
                            className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                              checkFlujoCls(seleccionados.has(p._id))
                            }`}
                            aria-label={`Seleccionar ${p.nombre}`}
                          >
                            <IconCheck className="w-4 h-4" strokeWidth={3} />
                          </button>
                        )}
                        {botonAcciones(p)}
                      </div>
                    </div>
                    {expandedId === p._id && p.variantes?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-ios-separator/40">{detalleVariantes(p)}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {totalProductos > 0 && (
            <Paginacion
              pagina={stockPagina}
              porPagina={stockPorPagina}
              total={totalProductos}
              onPagina={setStockPagina}
              onPorPagina={(n) => {
                setStockPorPagina(n);
                setStockPagina(1);
              }}
              deshabilitado={loading}
              className="mt-4"
            />
          )}
        </>
      )}

      {tab === 'movimientos' && esAdmin && (
        <>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <IosSearch
              value={movBuscar}
              onChange={(v) => {
                setMovBuscar(v);
                setMovLimit(100);
              }}
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
              className="btn-vivo btn-vivo-gris px-3.5 py-2 rounded-ios-pill text-sm font-medium"
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
                            <span className={`inline-flex items-center justify-center leading-none px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.cls}`}>
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
              {movHayMas && movLimit < 500 && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setMovLimit((n) => Math.min(n + 100, 500))}
                    className="btn-vivo btn-vivo-gris px-4 py-2.5 rounded-ios-pill text-sm font-medium"
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
                      {variantLabel(v)} · {v.codigo || 'sin código'} (dep: {v.deposito || 0} · salón: {v.cantidad || 0})
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
              {(etiquetaModal.variantes || []).length > 0 && etiquetaVariantIdx !== ''
                ? <span className="text-ios-tertiary"> · {etiquetaModal.variantes[Number(etiquetaVariantIdx)]?.codigo || 'sin código'}</span>
                : etiquetaModal.codigo && <span className="text-ios-tertiary"> · {etiquetaModal.codigo}</span>}
            </p>

            {(etiquetaModal.variantes || []).length > 0 && (
              <IosField label="Variante a imprimir" required>
                <IosSelect
                  value={etiquetaVariantIdx}
                  onChange={(e) => setEtiquetaVariantIdx(e.target.value)}
                >
                  <option value="" className="bg-ios-surface2">Seleccionar...</option>
                  {etiquetaModal.variantes.map((v, i) => (
                    <option key={i} value={String(i)} className="bg-ios-surface2">
                      {[v.talle, v.color].filter(Boolean).join(' / ') || 'Sin variante'}
                      {v.codigo ? ` · ${v.codigo}` : ''}
                    </option>
                  ))}
                </IosSelect>
              </IosField>
            )}

            <div>
              <p className="block text-[13px] text-ios-secondary font-medium mb-1.5">Formato</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEtiquetaModo('etiqueta')}
                  className={`flex-1 px-3 py-2 text-sm rounded-ios-control transition-all duration-150 active:scale-[0.97] ${
                    etiquetaModo === 'etiqueta'
                      ? 'btn-vivo btn-vivo-azul font-semibold'
                      : 'btn-vivo btn-vivo-gris font-medium'
                  }`}
                >
                  Etiqueta (una por página)
                </button>
                <button
                  type="button"
                  onClick={() => setEtiquetaModo('hoja')}
                  className={`flex-1 px-3 py-2 text-sm rounded-ios-control transition-all duration-150 active:scale-[0.97] ${
                    etiquetaModo === 'hoja'
                      ? 'btn-vivo btn-vivo-azul font-semibold'
                      : 'btn-vivo btn-vivo-gris font-medium'
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

      <IosModal
        open={showPromo}
        onClose={() => setShowPromo(false)}
        title="Nueva promoción"
        confirmText={promoSaving ? 'Creando…' : 'Crear promoción'}
        onConfirm={guardarPromo}
        confirmDisabled={promoSaving}
      >
        <div className="space-y-3">
          <IosField label="Nombre (opcional)">
            <IosInput
              value={promoForm.nombre}
              onChange={(e) => setPromoForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Oferta de primavera"
            />
          </IosField>
          <div className="grid grid-cols-2 gap-3">
            <IosField label="Tipo" required>
              <IosSelect value={promoForm.tipo} onChange={(e) => setPromoForm((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="porcentaje" className="bg-ios-surface2">Porcentaje (%)</option>
                <option value="monto" className="bg-ios-surface2">Monto fijo ($)</option>
              </IosSelect>
            </IosField>
            <IosField label={promoForm.tipo === 'porcentaje' ? 'Descuento (%)' : 'Descuento ($)'} required>
              <IosInput
                type="text"
                inputMode="decimal"
                value={promoForm.valor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d{0,5}(\.\d{0,2})?$/.test(v)) setPromoForm((f) => ({ ...f, valor: v }));
                }}
                placeholder={promoForm.tipo === 'porcentaje' ? 'Ej: 20' : 'Ej: 1500'}
              />
            </IosField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <IosField label="Desde" required>
              <IosInput
                type="datetime-local"
                value={promoForm.desde}
                onChange={(e) => setPromoForm((f) => ({ ...f, desde: e.target.value }))}
              />
            </IosField>
            <IosField label="Hasta" required>
              <IosInput
                type="datetime-local"
                value={promoForm.hasta}
                onChange={(e) => setPromoForm((f) => ({ ...f, hasta: e.target.value }))}
              />
            </IosField>
          </div>
          <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
            <span className="flex items-center gap-2.5">
              <IosToggle checked={promoForm.todos} onChange={() => setPromoForm((f) => ({ ...f, todos: !f.todos }))} />
              <span className="text-[13px] text-ios-secondary font-medium">Todos los productos (incluye nuevos)</span>
            </span>
          </label>
          <p className="text-[11px] text-ios-tertiary">
            {promoForm.todos
              ? 'La promoción se aplica a todo el catálogo mientras esté vigente.'
              : `Se aplica a ${seleccionados.size} producto${seleccionados.size === 1 ? '' : 's'} seleccionado${seleccionados.size === 1 ? '' : 's'}.`}
          </p>
        </div>
      </IosModal>

      <IosModal
        open={showAumento}
        onClose={() => setShowAumento(false)}
        title="Aumento masivo de precios"
        confirmText={aumentoSaving ? 'Aplicando…' : 'Aplicar aumento'}
        onConfirm={guardarAumento}
        confirmDisabled={aumentoSaving || seleccionados.size === 0}
        maxWidth="max-w-xl"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <IosField label="Tipo" required>
              <IosSelect value={aumentoForm.tipo} onChange={(e) => setAumentoForm((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="porcentaje" className="bg-ios-surface2">Porcentaje (%)</option>
                <option value="monto" className="bg-ios-surface2">Monto fijo ($)</option>
              </IosSelect>
            </IosField>
            <IosField label={aumentoForm.tipo === 'porcentaje' ? 'Aumento (%)' : 'Aumento ($)'} required>
              <IosInput
                type="text"
                inputMode="decimal"
                value={aumentoForm.valor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d{0,5}(\.\d{0,2})?$/.test(v)) setAumentoForm((f) => ({ ...f, valor: v }));
                }}
                placeholder={aumentoForm.tipo === 'porcentaje' ? 'Ej: 10' : 'Ej: 500'}
              />
            </IosField>
          </div>
          <p className="text-[11px] text-ios-tertiary">
            Se aplica a {seleccionados.size} producto{seleccionados.size === 1 ? '' : 's'} seleccionado{seleccionados.size === 1 ? '' : 's'}. El precio nuevo se calcula y se guarda en el servidor.
          </p>
          {previewLoading ? (
            <LoadingSpinner />
          ) : previewSeleccion.length > 0 ? (
            <div className="bg-ios-surface rounded-ios-card border border-ios-separator/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ios-tertiary font-semibold mb-1.5">Vista previa (orientativa)</p>
              <div className="space-y-1">
                {previewSeleccion.slice(0, 10).map((fila) => (
                  <div key={fila.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-ios-label font-medium truncate">{fila.nombre}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-ios-tertiary">{formatMoney(fila.anterior)}</span>
                      <span className="text-ios-tertiary mx-1">→</span>
                      <span className="text-ios-green font-semibold">{formatMoney(fila.nuevo)}</span>
                    </span>
                  </div>
                ))}
              </div>
              {previewSeleccion.length > 10 && (
                <p className="text-[11px] text-ios-tertiary mt-1.5">y {previewSeleccion.length - 10} producto(s) más…</p>
              )}
            </div>
          ) : null}
          {previewFaltantes > 0 && (
            <p className="text-[11px] text-ios-tertiary">
              {previewFaltantes} producto(s) seleccionado(s) no están en esta página; igual reciben el aumento.
            </p>
          )}
          {previewOfertas > 0 && (
            <p className="text-[11px] text-ios-orange">
              {previewOfertas} producto(s) tienen una oferta activa: el precio de oferta se recalcula solo sobre el nuevo precio.
            </p>
          )}
        </div>
      </IosModal>

      <IosModal
        open={showGestion}
        onClose={() => setShowGestion(false)}
        title="Ofertas y aumentos"
        confirmText="Cerrar"
        onConfirm={() => setShowGestion(false)}
        showCancel={false}
        maxWidth="max-w-xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => cambiarTabGestion('ofertas')}
            className={`px-3.5 py-1.5 rounded-ios-pill text-xs font-semibold transition-colors ${
              gestionTab === 'ofertas'
                ? 'bg-ios-tint text-white'
                : 'bg-ios-surface3 text-ios-secondary hover:bg-ios-separator/40 dark:bg-ios-surface2 dark:hover:bg-ios-surface3'
            }`}
          >
            Ofertas
          </button>
          <button
            type="button"
            onClick={() => cambiarTabGestion('aumentos')}
            className={`px-3.5 py-1.5 rounded-ios-pill text-xs font-semibold transition-colors ${
              gestionTab === 'aumentos'
                ? 'bg-ios-tint text-white'
                : 'bg-ios-surface3 text-ios-secondary hover:bg-ios-separator/40 dark:bg-ios-surface2 dark:hover:bg-ios-surface3'
            }`}
          >
            Aumentos
          </button>
        </div>

        {gestionTab === 'ofertas' ? (
          promocionesLoading ? (
            <LoadingSpinner />
          ) : promocionesError ? (
            <div className="px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
              {promocionesError}
            </div>
          ) : promociones.length === 0 ? (
            <p className="text-center text-sm text-ios-tertiary py-8">No hay promociones cargadas</p>
          ) : (
            <div className="space-y-2">
              {promociones.map((promo) => {
                const estado = ESTADOS_PROMO[promo.estado] || ESTADOS_PROMO.vencida;
                return (
                  <div key={promo._id} className="rounded-2xl border border-ios-separator/30 bg-ios-surface px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ios-label truncate">
                          {promo.nombre || 'Promoción'}
                          <span className="text-ios-orange font-semibold">
                            {' '}· {promo.tipo === 'porcentaje' ? `-${promo.valor}%` : `-${formatMoney(promo.valor)}`}
                          </span>
                        </p>
                        <p className="text-[11px] text-ios-tertiary mt-0.5 flex items-center gap-1">
                          <IconClock className="w-3 h-3" />
                          {formatDate(promo.desde)} → {formatDate(promo.hasta)}
                        </p>
                        <p className="text-[11px] text-ios-tertiary mt-0.5">
                          {promo.todos
                            ? 'Todos los productos'
                            : `${promo.cantidadProductos} producto${promo.cantidadProductos === 1 ? '' : 's'}`}
                          {promo.creadoPor ? ` · ${promo.creadoPor}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-ios-pill ${estado.cls}`}>
                          {estado.label}
                        </span>
                        {(promo.estado === 'activa' || promo.estado === 'programada') && (
                          <button
                            onClick={() => cancelarPromo(promo)}
                            className="block w-full text-[11px] font-semibold text-amber-400 hover:underline"
                          >
                            Cancelar
                          </button>
                        )}
                        {esAdmin && (
                          <button
                            onClick={() => eliminarPromo(promo)}
                            className="block w-full text-[11px] font-semibold text-ios-red hover:underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div className="mb-3 rounded-2xl border border-ios-tint/25 bg-ios-tint/10 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:justify-between">
              <p className="text-[11px] text-ios-secondary leading-relaxed">
                Para subir precios: tildá los productos en la lista y tocá{' '}
                <span className="font-semibold text-ios-label">Aplicar aumento</span> en el cartel verde de arriba.
              </p>
              <IosButton size="sm" variant="tinted" onClick={irASeleccionAumento} className="shrink-0">
                Elegir productos
              </IosButton>
            </div>
            {aumentosLoading ? (
              <LoadingSpinner />
            ) : aumentosError ? (
              <div className="px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
                {aumentosError}
              </div>
            ) : aumentos.length === 0 ? (
              <p className="text-center text-sm text-ios-tertiary py-8">Todavía no se aplicaron aumentos</p>
            ) : (
              <div className="space-y-2">
                {aumentos.map((aumento) => (
                  <div key={aumento._id} className="rounded-2xl border border-ios-separator/30 bg-ios-surface px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ios-label truncate">
                          {aumento.tipo === 'porcentaje' ? `+${aumento.valor}%` : `+${formatMoney(aumento.valor)}`}
                          <span className="text-ios-tertiary font-medium"> · {aumento.cantidad} producto{aumento.cantidad === 1 ? '' : 's'}</span>
                        </p>
                        <p className="text-[11px] text-ios-tertiary mt-0.5 flex items-center gap-1">
                          <IconClock className="w-3 h-3" />
                          {formatDate(aumento.fechaCreacion)}
                          {aumento.creadoPor ? ` · ${aumento.creadoPor}` : ''}
                        </p>
                        {aumento.deshecho && (
                          <p className="text-[11px] text-ios-tertiary mt-0.5">
                            Deshecho{aumento.deshechoPor ? ` por ${aumento.deshechoPor}` : ''}
                          </p>
                        )}
                      </div>
                      {!aumento.deshecho && (
                        <button
                          onClick={() => confirmarDeshacer(aumento)}
                          disabled={deshaciendoId === aumento._id}
                          className="shrink-0 text-[11px] font-semibold text-amber-400 hover:underline disabled:opacity-50"
                        >
                          {deshaciendoId === aumento._id ? 'Deshaciendo…' : 'Deshacer'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </IosModal>
    </div>
  );
};

export default Deposito;
