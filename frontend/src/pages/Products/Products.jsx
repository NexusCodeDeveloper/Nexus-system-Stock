import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  exchangeProduct,
  addStock,
  getLowStock,
} from '../../api/products';
import { createReturn } from '../../api/returns';
import { createSale } from '../../api/sales';
import { getApiErrorMessage } from '../../utils/apiError';
import Ticket, { printTicket } from '../../components/Ticket/Ticket';
import ProductForm from '../../components/ProductForm/ProductForm';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useIosAlert, IconAlert } from '../../components/alerts';
import IosButton from '../../components/ui/IosButton';
import IosModal from '../../components/ui/IosModal';
import IosSearch from '../../components/ui/IosSearch';
import IosToggle from '../../components/ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../../components/ui/IosForm';
import { IconCart, IconPlus, IconChevronDown, IconTrash, IconX, IconPencil, IconList, IconBox } from '../../components/ui/icons';

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
const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dropdown, setDropdown] = useState({ product: null, x: 0, y: 0 });
  const dropdownRef = useRef(null);
  const anchorRef = useRef(null);

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [returnModal, setReturnModal] = useState(null);
  const [returnCantidad, setReturnCantidad] = useState('1');
  const [returnVariantIdx, setReturnVariantIdx] = useState('');
  const [returnMotivo, setReturnMotivo] = useState('');
  const [returnOtroMotivo, setReturnOtroMotivo] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const [exchangeActivo, setExchangeActivo] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeTarget, setExchangeTarget] = useState(null);
  const [exchangeCantidad, setExchangeCantidad] = useState('1');
  const [exchangeVariantIdx, setExchangeVariantIdx] = useState('');

  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [quickAdd, setQuickAdd] = useState(null);
  const [qaCantidad, setQaCantidad] = useState('1');
  const [qaVariantIdx, setQaVariantIdx] = useState('');

  const [sellEmpleado, setSellEmpleado] = useState('');
  const [sellDescuento, setSellDescuento] = useState('');
  const [sellMetodoPago, setSellMetodoPago] = useState('efectivo');
  const [sellSplit, setSellSplit] = useState(false);
  const [sellMetodo2, setSellMetodo2] = useState('transferencia');
  const [sellMonto2, setSellMonto2] = useState('');
  const [sellSaving, setSellSaving] = useState(false);

  const [addStockModal, setAddStockModal] = useState(null);
  const [addStockCantidad, setAddStockCantidad] = useState('1');
  const [addStockVariantIdx, setAddStockVariantIdx] = useState('');

  const { user } = useAuth();
  const { show: alert, confirm, toast } = useIosAlert();

  const [lowStock, setLowStock] = useState([]);
  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [allProducts, setAllProducts] = useState([]);

  const [expandedId, setExpandedId] = useState(null);

  const [lastSale, setLastSale] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  const agotados = lowStock.filter((i) => i.cantidad === 0);
  const bajos = lowStock.filter((i) => i.cantidad > 0);

  const cartTotal = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const descuentoNum = sellDescuento === '' ? 0 : Number(sellDescuento);
  const finalTotal = cartTotal * (1 - descuentoNum / 100);
  const sellMonto2Num = sellMonto2 === '' ? 0 : Number(sellMonto2);
  const sellMonto1 = sellSplit ? finalTotal - sellMonto2Num : finalTotal;

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const prodRes = await getProducts({ search });
      setProducts(prodRes.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar productos'));
    } finally {
      setLoading(false);
    }
  };

  const fetchLowStock = () => {
    getLowStock()
      .then((res) => setLowStock(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchLowStock();
    getProducts({})
      .then((res) => setAllProducts(res.data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateProduct(editing._id, data);
      } else {
        await createProduct(data);
      }
      setShowForm(false);
      setEditing(null);
      fetchData();
      fetchLowStock();
      toast({ message: 'Producto guardado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al guardar producto') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setEditing(product);
    setShowForm(true);
  };

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
      await deleteProduct(id);
      fetchData();
      fetchLowStock();
      toast({ message: 'Producto eliminado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al eliminar producto') });
    }
  };

  const openQuickAdd = (product) => {
    setQuickAdd(product);
    setQaCantidad('1');
    setQaVariantIdx('');
  };

  const confirmQuickAdd = () => {
    const cantidad = Number(qaCantidad);
    if (cantidad < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida' });
      return;
    }
    if (quickAdd.variants?.length > 0 && qaVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar una variante' });
      return;
    }
    const variant = quickAdd.variants?.[Number(qaVariantIdx)];
    const stockDisponible = variant ? variant.cantidad : quickAdd.cantidad;
    if (cantidad > stockDisponible) {
      alert({ icon: 'warning', title: 'Stock insuficiente', message: `Solo hay ${stockDisponible} unidad(es) disponible(s)` });
      return;
    }
    setCart(prev => [...prev, {
      producto: quickAdd._id,
      nombre: quickAdd.nombre,
      precio: quickAdd.precio,
      cantidad,
      talle: variant?.talle || '',
      color: variant?.color || '',
    }]);
    setQuickAdd(null);
    toast({ message: 'Agregado al carrito', duration: 1400 });
  };

  const removeFromCart = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCartItem = (idx, field, value) => {
    setCart(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const openCart = () => {
    if (cart.length === 0) {
      alert({ icon: 'info', title: 'Carrito vacío', message: 'Agregue productos desde el menú de cada producto' });
      return;
    }
    setSellEmpleado('');
    setSellDescuento('');
    setSellMetodoPago('efectivo');
    setSellSplit(false);
    setSellMetodo2('transferencia');
    setSellMonto2('');
    setShowCart(true);
  };

  const setMetodoPago = (key) => {
    setSellMetodoPago(key);
    if (sellSplit && sellMetodo2 === key) {
      setSellMetodo2(metodos.find((m) => m.key !== key)?.key || '');
    }
  };

  const toggleSplit = () => {
    setSellSplit(!sellSplit);
    setSellMonto2('');
    if (!sellSplit && sellMetodo2 === sellMetodoPago) {
      setSellMetodo2(metodos.find((m) => m.key !== sellMetodoPago)?.key || '');
    }
  };

  const confirmSale = async () => {
    if (sellSaving) return;
    if (!sellEmpleado.trim()) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe ingresar el nombre del empleado' });
      return;
    }
    if (descuentoNum < 0 || descuentoNum > 100) {
      alert({ icon: 'warning', title: 'Descuento inválido', message: 'El descuento debe estar entre 0 y 100%' });
      return;
    }
    if (sellSplit && sellMetodo2 === sellMetodoPago) {
      alert({ icon: 'warning', title: 'Método repetido', message: 'El segundo método de pago debe ser distinto del primero' });
      return;
    }
    if (sellSplit && (!Number.isFinite(sellMonto2Num) || sellMonto2Num > finalTotal + 0.01)) {
      alert({ icon: 'warning', title: 'Montos incorrectos', message: 'El segundo monto no puede superar el total' });
      return;
    }
    if (cart.some((i) => !Number.isFinite(i.precio) || i.precio <= 0 || !Number.isInteger(i.cantidad) || i.cantidad < 1)) {
      alert({ icon: 'warning', title: 'Carrito inválido', message: 'Verifique cantidades y precios del carrito' });
      return;
    }
    setSellSaving(true);
    try {
      const pagos = sellSplit
        ? [{ metodo: sellMetodoPago, monto: Math.round(sellMonto1 * 100) / 100 }, { metodo: sellMetodo2, monto: Math.round(sellMonto2Num * 100) / 100 }]
        : [{ metodo: sellMetodoPago, monto: Math.round(finalTotal * 100) / 100 }];
      const res = await createSale({
        items: cart.map(i => ({ producto: i.producto, cantidad: i.cantidad, talle: i.talle, color: i.color || '' })),
        empleado: sellEmpleado.trim(),
        pagos,
        descuento: descuentoNum,
      });
      setLastSale(res.data);
      setShowTicketModal(true);
      setCart([]);
      setShowCart(false);
      fetchData();
      fetchLowStock();
      toast({ message: 'Venta registrada' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al vender') });
    } finally {
      setSellSaving(false);
    }
  };

  const handlePrintTicket = () => {
    if (!lastSale) return;
    const ok = printTicket(lastSale);
    if (ok) setShowTicketModal(false);
  };

  const openAddStock = (product) => {
    setAddStockModal(product);
    setAddStockCantidad('1');
    setAddStockVariantIdx('');
  };

  const confirmAddStock = async () => {
    if (addStockModal.variants?.length > 0 && addStockVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar una variante' });
      return;
    }
    const cantidad = Number(addStockCantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe ingresar al menos 1 unidad' });
      return;
    }
    const variant = addStockModal.variants?.[Number(addStockVariantIdx)];
    try {
      await addStock(addStockModal._id, { cantidad, talle: variant?.talle || '', color: variant?.color || '' });
      setAddStockModal(null);
      fetchData();
      fetchLowStock();
      toast({ message: 'Stock actualizado' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al agregar stock') });
    }
  };

  const openReturn = (product) => {
    setReturnModal(product);
    setReturnCantidad('1');
    setReturnVariantIdx('');
    setReturnMotivo('');
    setReturnOtroMotivo('');
    setExchangeActivo(false);
    setExchangeSearch('');
    setExchangeTarget(null);
    setExchangeCantidad('1');
    setExchangeVariantIdx('');
  };

  const toggleExchange = (value) => {
    setExchangeActivo(value);
    if (!value) {
      setExchangeTarget(null);
      setExchangeCantidad('1');
      setExchangeVariantIdx('');
      setExchangeSearch('');
    }
  };

  const getReturnMotivo = () => returnMotivo === 'Otro' ? returnOtroMotivo.trim() : returnMotivo.trim();

  const confirmReturn = async () => {
    if (returnSaving) return;
    const motivoFinal = getReturnMotivo();
    if (!motivoFinal) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe ingresar un motivo' });
      return;
    }
    if (exchangeActivo && !exchangeTarget) {
      alert({ icon: 'warning', title: 'Falta el producto', message: 'Debe elegir el producto por el que se cambia' });
      return;
    }
    const cantidadDevolver = Number(returnCantidad);
    if (!Number.isInteger(cantidadDevolver) || cantidadDevolver < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe devolver al menos 1 unidad' });
      return;
    }
    if (exchangeTarget) {
      const cantidadCargar = Number(exchangeCantidad);
      if (!Number.isInteger(cantidadCargar) || cantidadCargar < 1) {
        alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe cargar al menos 1 unidad' });
        return;
      }
    }
    if (returnModal.variants?.length > 0 && returnVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar la variante a devolver' });
      return;
    }
    if (exchangeTarget?.variants?.length > 0 && exchangeVariantIdx === '') {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar la variante del producto nuevo' });
      return;
    }
    const retVariant = returnModal.variants?.[Number(returnVariantIdx)];
    const excVariant = exchangeTarget?.variants?.[Number(exchangeVariantIdx)];
    setReturnSaving(true);
    try {
      if (exchangeTarget) {
        await exchangeProduct({
          productoDevolver: returnModal._id,
          cantidadDevolver: cantidadDevolver,
          talleDevolver: retVariant?.talle || '',
          colorDevolver: retVariant?.color || '',
          productoCargar: exchangeTarget._id,
          cantidadCargar: Number(exchangeCantidad),
          talleCargar: excVariant?.talle || '',
          colorCargar: excVariant?.color || '',
          motivo: motivoFinal,
        });
      } else {
        await createReturn({
          producto: returnModal._id,
          cantidad: cantidadDevolver,
          talle: retVariant?.talle || '',
          color: retVariant?.color || '',
          motivo: motivoFinal,
        });
      }
      setReturnModal(null);
      fetchData();
      fetchLowStock();
      toast({ message: exchangeTarget ? 'Cambio registrado' : 'Devolución registrada' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: getApiErrorMessage(err, 'Error al registrar') });
    } finally {
      setReturnSaving(false);
    }
  };

  const filteredExchange = allProducts.filter(
    (p) =>
      p._id !== returnModal?._id &&
      p.nombre.toLowerCase().includes(exchangeSearch.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

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

  const metodos = [
    { key: 'efectivo', label: 'Efectivo', activeCls: 'bg-ios-green/15 text-ios-green border-ios-green/30' },
    { key: 'transferencia', label: 'Transferencia', activeCls: 'bg-ios-tint/15 text-ios-tint border-ios-tint/30' },
    { key: 'tarjeta', label: 'Tarjeta', activeCls: 'bg-ios-purple/15 text-ios-purple border-ios-purple/30' },
  ];

  const handleDropdownAction = (action) => {
    const p = dropdown.product;
    setDropdown({ product: null, x: 0, y: 0 });
    if (action === 'carrito') openQuickAdd(p);
    else if (action === 'stock') openAddStock(p);
    else if (action === 'cambio') openReturn(p);
    else if (action === 'editar') handleEdit(p);
    else if (action === 'eliminar') handleDelete(p._id);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="text-[28px] font-bold text-ios-label tracking-tight">Productos</h1>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <IosButton variant="tinted" onClick={openCart} className="flex-1 sm:flex-none relative">
            <IconCart className="w-[18px] h-[18px]" />
            Carrito
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-ios-tint text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-[0_2px_6px_rgba(10,132,255,0.5)]">
                {cart.length}
              </span>
            )}
          </IosButton>
          {user?.rol === 'admin' && (
            <IosButton variant="primary" onClick={openCreate} className="flex-1 sm:flex-none">
              <IconPlus className="w-4 h-4" />
              Nuevo Producto
            </IosButton>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <IosSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre o categoría..."
          className="w-full md:w-96"
        />
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
                <div className="absolute left-0 md:left-auto top-full mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] bg-ios-surface/95 backdrop-blur-2xl border border-ios-separator/40 rounded-2xl shadow-ios-alert p-2 animate-ios-modal max-h-64 overflow-y-auto">
                  {bajos.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs text-ios-orange/90 rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-ios-orange/60 shrink-0" />
                      <span className="font-medium truncate">{item.productoNombre}</span>
                      {item.talle && <span className="shrink-0 text-ios-tertiary">· {item.talle}</span>}
                      {item.color && <span className="shrink-0 text-ios-tertiary">· {item.color}</span>}
                      <span className="ml-auto shrink-0 text-ios-orange/70 font-semibold">{item.cantidad} uds.</span>
                    </div>
                  ))}
                  {bajos.length > 0 && agotados.length > 0 && (
                    <div className="h-px bg-ios-separator/50 my-1 mx-3" />
                  )}
                  {agotados.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs text-ios-red rounded-xl">
                      <span className="w-1.5 h-1.5 rounded-full bg-ios-red shrink-0" />
                      <span className="font-medium truncate">{item.productoNombre}</span>
                      {item.talle && <span className="shrink-0 text-ios-red/60">· {item.talle}</span>}
                      {item.color && <span className="shrink-0 text-ios-red/60">· {item.color}</span>}
                      <span className="ml-auto shrink-0 font-semibold">AGOTADO</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <IosModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        maxWidth="max-w-2xl"
      >
        <h2 className="text-[17px] font-semibold text-ios-label mb-4">
          {editing ? 'Editar Producto' : 'Nuevo Producto'}
        </h2>
        <ProductForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          isSubmitting={isSubmitting}
        />
      </IosModal>

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
              ${Number(quickAdd?.precio || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          </IosField>
          {renderVariantSelect(quickAdd?.variants, qaVariantIdx, setQaVariantIdx)}
        </div>
      </IosModal>

      <IosModal
        open={showCart}
        onClose={() => setShowCart(false)}
        title={`Carrito (${cart.length} productos)`}
        cancelText="Seguir comprando"
        confirmText="Confirmar Venta"
        confirmVariant="tinted"
        onConfirm={confirmSale}
        confirmDisabled={sellSaving}
        maxWidth="max-w-2xl"
      >
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
                    if (v === '' || /^\d+$/.test(v)) updateCartItem(idx, 'cantidad', v === '' ? 1 : Math.max(1, Number(v)));
                  }}
                  className="w-16 px-2 py-1.5 text-center bg-ios-surface2 rounded-lg text-ios-label text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-ios-tertiary">×</span>
                <span className="w-24 px-2 py-1.5 text-right text-ios-label text-sm font-medium">
                  ${(item.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-ios-tertiary text-xs font-medium w-20 text-right">
                  ${(item.precio * item.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
              <IosInput
                type="text" value={sellEmpleado}
                onChange={(e) => setSellEmpleado(e.target.value)}
                placeholder="Nombre"
              />
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
                Monto: <span className="text-ios-label font-semibold">${sellMonto1.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </span>
            </div>
            {sellSplit && (
              <div className="space-y-2 pt-3 border-t border-ios-separator/40">
                <div className="flex items-center justify-between px-3 py-2 bg-ios-tint/10 rounded-ios-control">
                  <span className="text-sm font-semibold text-ios-tint">{metodos.find((m) => m.key === sellMetodoPago)?.label}</span>
                  <span className="text-sm text-ios-label font-mono">${sellMonto1.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
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
            <span className="text-ios-secondary font-semibold">Total: <span className="text-ios-label text-lg font-bold">${finalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></span>
          </div>
        </div>
      </IosModal>

      <IosModal
        open={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        title="Venta registrada"
        cancelText="Cerrar"
        showCancel
        confirmText="Imprimir ticket"
        onConfirm={handlePrintTicket}
        maxWidth="max-w-md"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-full overflow-x-auto py-1">
            <div className="ticket-paper">
              {lastSale ? <Ticket sale={lastSale} /> : <p className="text-center">Cargando…</p>}
            </div>
          </div>
          <p className="text-xs text-ios-tertiary text-center leading-relaxed">
            Imprimí el ticket para entregar al cliente. También podés reimprimirlo desde la sección Ventas.
          </p>
        </div>
      </IosModal>

      <IosModal
        open={!!addStockModal}
        onClose={() => setAddStockModal(null)}
        title="Agregar Stock"
        cancelText="Cancelar"
        confirmText="Confirmar Ingreso"
        onConfirm={confirmAddStock}
      >
        <p className="text-ios-secondary text-sm mb-4">
          <span className="text-ios-label font-semibold">{addStockModal?.nombre}</span> — Stock actual: {addStockModal?.cantidad}
        </p>
        <div className="space-y-4">
          {renderVariantSelect(addStockModal?.variants, addStockVariantIdx, setAddStockVariantIdx)}
          <IosField label="¿Cuántas unidades entraron?">
            <IosInput
              type="text" inputMode="numeric"
              value={addStockCantidad}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+$/.test(v)) setAddStockCantidad(v);
              }}
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={!!returnModal}
        onClose={() => setReturnModal(null)}
        title="Devolución / Cambio"
        cancelText="Cancelar"
        confirmText={returnSaving ? 'Guardando…' : exchangeTarget ? 'Confirmar Cambio' : 'Confirmar Devolución'}
        confirmVariant="destructiveTinted"
        onConfirm={confirmReturn}
        confirmDisabled={returnSaving}
        maxWidth="max-w-xl"
      >
        <p className="text-ios-secondary text-sm mb-4">
          <span className="text-ios-label font-semibold">{returnModal?.nombre}</span> — Stock actual: {returnModal?.cantidad}
        </p>

        <div className="space-y-4">
          <IosField label="Cantidad a devolver">
            <IosInput
              type="text" inputMode="numeric"
              value={returnCantidad}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+$/.test(v)) setReturnCantidad(v);
              }}
            />
          </IosField>

          {renderVariantSelect(returnModal?.variants, returnVariantIdx, setReturnVariantIdx, 'Variante a devolver')}

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <IosToggle checked={exchangeActivo} onChange={toggleExchange} />
            <span className="text-sm text-ios-label font-medium">Quiero cambiarlo por otro producto</span>
          </label>

          {exchangeActivo && (
            <>
              <IosField label="Buscar producto nuevo">
                <IosSearch
                  value={exchangeSearch}
                  onChange={setExchangeSearch}
                  placeholder="Escribí el nombre..."
                />
              </IosField>

              {exchangeSearch && filteredExchange.length > 0 && (
                <div className="border border-ios-separator/40 rounded-2xl max-h-36 overflow-y-auto bg-ios-surface overflow-hidden">
                  {filteredExchange.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => {
                        setExchangeTarget(p);
                        setExchangeSearch('');
                        setExchangeCantidad('1');
                        setExchangeVariantIdx('');
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-ios-separator/30 last:border-0 transition-colors ${
                        exchangeTarget?._id === p._id
                          ? 'bg-ios-purple/10 text-ios-purple font-semibold'
                          : 'text-ios-secondary hover:bg-ios-hover/5'
                      }`}
                    >
                      {p.nombre} <span className="text-ios-tertiary">(stock: {p.cantidad})</span>
                    </button>
                  ))}
                </div>
              )}

              {exchangeTarget && (
                <div className="bg-ios-purple/10 border border-ios-purple/25 rounded-2xl p-4 space-y-4">
                  <p className="text-sm text-ios-purple font-medium">
                    <span className="font-semibold">Producto nuevo:</span> {exchangeTarget.nombre}
                    <br />
                    <span className="font-semibold">Stock disponible:</span> {exchangeTarget.cantidad}
                  </p>
                  {renderVariantSelect(exchangeTarget.variants, exchangeVariantIdx, setExchangeVariantIdx, 'Variante a cargar')}
                  <IosField label="Cantidad a cargar">
                    <IosInput
                      type="text" inputMode="numeric"
                      value={exchangeCantidad}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) setExchangeCantidad(v);
                      }}
                    />
                  </IosField>
                </div>
              )}
            </>
          )}

          <IosField label="Motivo">
            <IosSelect value={returnMotivo} onChange={(e) => setReturnMotivo(e.target.value)}>
              <option value="" className="bg-ios-surface2">Seleccionar motivo</option>
              <option value="Defectuoso" className="bg-ios-surface2">Defectuoso</option>
              <option value="Cambio de talla" className="bg-ios-surface2">Cambio de talla</option>
              <option value="Cambio de modelo" className="bg-ios-surface2">Cambio de modelo</option>
              <option value="Devolución de venta" className="bg-ios-surface2">Devolución de venta</option>
              <option value="Otro" className="bg-ios-surface2">Otro</option>
            </IosSelect>
          </IosField>

          {returnMotivo === 'Otro' && (
            <IosField label="Detalle del motivo">
              <IosInput
                type="text"
                value={returnOtroMotivo}
                onChange={(e) => setReturnOtroMotivo(e.target.value)}
                placeholder="Escribí el motivo..."
              />
            </IosField>
          )}
        </div>
      </IosModal>

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
                    <td className="px-5 py-3.5 font-semibold text-ios-label">{p.nombre}</td>
                    <td className="px-4 py-3.5">
                      {expandedId === p._id ? (
                        <div className="text-xs leading-relaxed space-y-0.5 animate-slideDown">
                          {p.colores?.length > 0
                            ? p.colores.map((color) => {
                                const vars = p.variants.filter((v) => v.color === color);
                                return (
                                  <div key={color}>
                                    <span className="font-semibold text-ios-secondary">{color}: </span>
                                    {vars.length > 0
                                      ? vars.map((v, i) => (
                                          <span key={i} className="text-ios-tertiary">
                                            {v.talle}({v.cantidad}){i < vars.length - 1 ? ' · ' : ''}
                                          </span>
                                        ))
                                      : <span className="text-ios-tertiary">—</span>}
                                  </div>
                                );
                              })
                            : p.variants?.length > 0
                              ? p.variants.map((v, i) => (
                                  <span key={i} className="text-ios-tertiary">
                                    {variantShortLabel(v)}:{v.cantidad}{i < p.variants.length - 1 ? ', ' : ''}
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
                                const count = p.variants.filter((v) => v.color === c).length;
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
                          ) : p.variants?.length > 0 ? (
                            <span className="text-ios-secondary">{p.variants.length} variantes</span>
                          ) : (
                            <span className="text-ios-tertiary">—</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ios-secondary">
                      {p.precio != null ? `$${Number(p.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${(p.stockMinimo != null && p.cantidad <= p.stockMinimo) ? 'text-ios-red font-semibold' : 'text-ios-label'}`}>
                        {(p.stockMinimo != null && p.cantidad <= p.stockMinimo) && (
                          <IconAlert className="w-4 h-4" strokeWidth={2} />
                        )}
                        {p.cantidad}
                      </span>
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${(p.stockMinimo != null && p.cantidad <= p.stockMinimo) ? 'bg-ios-red/15 text-ios-red' : 'bg-ios-surface2 text-ios-secondary'}`}>
                      {p.cantidad}
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
                    {p.precio != null ? `$${Number(p.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ios-tertiary">
                    {p.colores?.length > 0
                      ? `${p.colores.length} ${p.colores.length === 1 ? 'color' : 'colores'}`
                      : p.variants?.length > 0
                        ? `${p.variants.length} variantes`
                        : 'Ver detalle'}
                    <IconChevronDown className={`w-3 h-3 transition-transform ${expandedId === p._id ? 'rotate-180' : ''}`} strokeWidth={2.2} />
                  </span>
                </button>
                {expandedId === p._id && (
                  <div className="mt-3 pt-3 border-t border-ios-separator/40 text-xs leading-relaxed space-y-1 animate-slideDown">
                    {p.colores?.length > 0
                      ? p.colores.map((color) => {
                          const vars = p.variants.filter((v) => v.color === color);
                          return (
                            <div key={color}>
                              <span className="font-semibold text-ios-secondary">{color}: </span>
                              {vars.length > 0
                                ? vars.map((v, i) => (
                                    <span key={i} className="text-ios-tertiary">
                                      {v.talle}({v.cantidad}){i < vars.length - 1 ? ' · ' : ''}
                                    </span>
                                  ))
                                : <span className="text-ios-tertiary">—</span>}
                            </div>
                          );
                        })
                      : p.variants?.length > 0
                        ? p.variants.map((v, i) => (
                            <span key={i} className="text-ios-tertiary">
                              {variantShortLabel(v)}:{v.cantidad}{i < p.variants.length - 1 ? ', ' : ''}
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
            {user?.rol === 'admin' && (
              <button
                onClick={() => handleDropdownAction('editar')}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-tint hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
              >
                <IconPencil className="w-4 h-4" />
                Editar
              </button>
            )}
            <button
              onClick={() => handleDropdownAction('carrito')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-orange hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconCart className="w-4 h-4" />
              vender
            </button>
            {user?.rol === 'admin' && (
              <button
                onClick={() => handleDropdownAction('stock')}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-tint hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
              >
                <IconList className="w-4 h-4" />
                Agregar Stock
              </button>
            )}
            <button
              onClick={() => handleDropdownAction('cambio')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-ios-purple hover:bg-ios-hover/5 rounded-xl transition-colors font-medium"
            >
              <IconX className="w-4 h-4" />
              Cambio
            </button>
            {user?.rol === 'admin' && (
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

export default Products;
