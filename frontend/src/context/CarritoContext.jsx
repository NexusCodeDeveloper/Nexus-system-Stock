import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { crearVenta } from '../api/ventas';
import { obtenerProducto } from '../api/productos';
import { useAutenticacion } from './AutenticacionContext';
import { useIosAlert } from '../components/alerts';
import { obtenerMensajeErrorApi } from '../utils/apiError';
import IosModal from '../components/ui/IosModal';
import Ticket, { printTicket } from '../components/Ticket/Ticket';

const CarritoContext = createContext(null);

export const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo', activeCls: 'bg-ios-green/15 text-ios-green border-ios-green/30' },
  { key: 'transferencia', label: 'Transferencia', activeCls: 'bg-ios-tint/15 text-ios-tint border-ios-tint/30' },
  { key: 'tarjeta', label: 'Tarjeta', activeCls: 'bg-ios-purple/15 text-ios-purple border-ios-purple/30' },
];

export const CarritoProvider = ({ children }) => {
  const { usuario } = useAutenticacion();
  const { show: alert, toast } = useIosAlert();

  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [sellEmpleado, setSellEmpleado] = useState(usuario?.nombre || '');
  const [sellDescuento, setSellDescuento] = useState('');
  const [sellMetodoPago, setSellMetodoPago] = useState('efectivo');
  const [sellSplit, setSellSplit] = useState(false);
  const [sellMetodo2, setSellMetodo2] = useState('transferencia');
  const [sellMonto2, setSellMonto2] = useState('');
  const [sellSaving, setSellSaving] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [saleVersion, setSaleVersion] = useState(0);

  const cartTotal = Math.round(cart.reduce((s, i) => s + i.precio * (Number(i.cantidad) || 0), 0) * 100) / 100;
  const descuentoNum = sellDescuento === '' ? 0 : Number(sellDescuento);
  const finalTotal = Math.round(cartTotal * (1 - descuentoNum / 100) * 100) / 100;
  const sellMonto2Num = sellMonto2 === '' ? 0 : Number(sellMonto2);
  const sellMonto1 = sellSplit ? Math.round((finalTotal - sellMonto2Num) * 100) / 100 : finalTotal;

  const resetSell = useCallback(() => {
    setSellEmpleado(usuario?.nombre || '');
    setSellDescuento('');
    setSellMetodoPago('efectivo');
    setSellSplit(false);
    setSellMetodo2('transferencia');
    setSellMonto2('');
  }, [usuario?.nombre]);

  useEffect(() => {
    if (cart.length === 0) resetSell();
  }, [cart.length, resetSell]);

  const addItem = useCallback((item) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (i) =>
          i.producto === item.producto &&
          (i.talle || '') === (item.talle || '') &&
          (i.color || '') === (item.color || '')
      );
      if (idx === -1) return [...prev, item];
      const copia = [...prev];
      copia[idx] = { ...copia[idx], cantidad: Number(copia[idx].cantidad || 0) + (Number(item.cantidad) || 1) };
      return copia;
    });
  }, []);

  const removeFromCart = useCallback((idx) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateCartItem = useCallback((idx, field, value) => {
    setCart((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const openCart = useCallback(() => {
    if (cart.length === 0) {
      alert({ icon: 'info', title: 'Carrito vacío', message: 'Agregue productos desde el menú de cada producto' });
      return;
    }
    setShowCartModal(true);
  }, [cart.length, alert]);

  const closeCart = useCallback(() => setShowCartModal(false), []);

  const setMetodoPago = useCallback((key) => {
    setSellMetodoPago(key);
    setSellMetodo2((prev) => (sellSplit && prev === key
      ? METODOS_PAGO.find((m) => m.key !== key)?.key || ''
      : prev));
  }, [sellSplit]);

  const toggleSplit = useCallback(() => {
    const next = !sellSplit;
    setSellSplit(next);
    setSellMonto2('');
    if (next) {
      setSellMetodo2((m) => (m === sellMetodoPago ? METODOS_PAGO.find((x) => x.key !== sellMetodoPago)?.key || '' : m));
    }
  }, [sellSplit, sellMetodoPago]);

  const validarCarrito = useCallback(async () => {
    const respuestas = await Promise.allSettled(cart.map((i) => obtenerProducto(i.producto).then((r) => r.data)));
    const problemas = [];
    const actualizados = cart.map((item, idx) => {
      const res = respuestas[idx];
      const p = res.status === 'fulfilled' ? res.value : null;
      if (!p) {
        problemas.push(`"${item.nombre || 'Un producto'}" ya no existe.`);
        return item;
      }
      const precio = Number(p.precio) || 0;
      if (Math.abs(precio - Number(item.precio)) > 0.001) {
        problemas.push(`"${p.nombre}" cambió de precio ($${Number(item.precio).toFixed(2)} → $${precio.toFixed(2)}).`);
        return { ...item, precio, nombre: p.nombre };
      }
      let disponible;
      if (p.variantes?.length > 0) {
        const norm = (v) => String(v ?? '').trim().toLowerCase();
        const v = p.variantes.find(
          (x) => norm(x.talle) === norm(item.talle) && norm(x.color) === norm(item.color)
        );
        disponible = v?.cantidad ?? 0;
      } else {
        disponible = p.cantidad ?? 0;
      }
      if (disponible < Number(item.cantidad)) {
        problemas.push(`"${p.nombre}" ya no tiene stock suficiente (quedan ${disponible}).`);
      }
      return { ...item, precio, nombre: p.nombre };
    });
    return { actualizados, problemas };
  }, [cart]);

  const confirmSale = useCallback(async () => {
    if (sellSaving) return;
    if (!sellEmpleado.trim()) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'No se pudo identificar al usuario de la sesión' });
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
    if (sellSplit && (!Number.isFinite(sellMonto2Num) || sellMonto2Num <= 0 || sellMonto2Num > finalTotal + 0.01)) {
      alert({ icon: 'warning', title: 'Montos incorrectos', message: 'El segundo monto debe ser mayor a $0 y no puede superar el total' });
      return;
    }
    if (sellSplit && sellMonto1 <= 0) {
      alert({ icon: 'warning', title: 'Montos incorrectos', message: 'El primer monto debe ser mayor a $0' });
      return;
    }
    if (cart.some((i) => !Number.isFinite(i.precio) || i.precio <= 0 || !Number.isInteger(Number(i.cantidad)) || Number(i.cantidad) < 1)) {
      alert({ icon: 'warning', title: 'Carrito inválido', message: 'Verifique cantidades y precios del carrito' });
      return;
    }
    setSellSaving(true);
    try {
      try {
        const { actualizados, problemas } = await validarCarrito();
        if (problemas.length > 0) {
          setCart(actualizados);
          alert({
            icon: 'warning',
            title: 'El carrito cambió',
            message: `${problemas.join(' ')} Revisá el total y confirmá de nuevo.`,
          });
          return;
        }
      } catch {
        /* si la verificación falla, el backend valida precios y stock igual */
      }

      const pagos = sellSplit
        ? [
            { metodo: sellMetodoPago, monto: Math.round(sellMonto1 * 100) / 100 },
            { metodo: sellMetodo2, monto: Math.round(sellMonto2Num * 100) / 100 },
          ]
        : [{ metodo: sellMetodoPago, monto: Math.round(finalTotal * 100) / 100 }];
      const res = await crearVenta({
        articulos: cart.map((i) => ({ producto: i.producto, cantidad: Number(i.cantidad), talle: i.talle, color: i.color || '' })),
        pagos,
        descuento: descuentoNum,
        offset: new Date().getTimezoneOffset(),
      });
      setLastSale(res.data);
      setShowTicketModal(true);
      setCart([]);
      setShowCartModal(false);
      setSaleVersion((v) => v + 1);
      toast({ message: 'Venta registrada' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al vender') });
    } finally {
      setSellSaving(false);
    }
  }, [sellSaving, sellEmpleado, descuentoNum, sellSplit, sellMetodo2, sellMetodoPago, sellMonto2Num, finalTotal, sellMonto1, cart, validarCarrito, alert, toast]);

  const handlePrintTicket = useCallback(async () => {
    if (!lastSale) return;
    const ok = await printTicket(lastSale);
    if (ok) setShowTicketModal(false);
    else toast({ message: 'Habilitá las ventanas emergentes para imprimir' });
  }, [lastSale, toast]);

  const value = useMemo(() => ({
    cart,
    addItem,
    removeFromCart,
    updateCartItem,
    clearCart,
    showCartModal,
    openCart,
    closeCart,
    metodos: METODOS_PAGO,
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
  }), [
    cart, addItem, removeFromCart, updateCartItem, clearCart, showCartModal, openCart, closeCart,
    sellEmpleado, sellDescuento, sellMetodoPago, setMetodoPago, sellSplit, toggleSplit,
    sellMetodo2, sellMonto2, sellSaving, descuentoNum, finalTotal, sellMonto1, confirmSale, saleVersion,
  ]);

  return (
    <CarritoContext.Provider value={value}>
      {children}
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
    </CarritoContext.Provider>
  );
};

export const useCarrito = () => {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
};
