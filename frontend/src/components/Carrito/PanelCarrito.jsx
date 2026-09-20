import { useCarrito } from '../../context/CarritoContext';
import { useCaja } from '../../context/CajaContext';
import { useAutenticacion } from '../../context/AutenticacionContext';
import IosButton from '../ui/IosButton';
import IosToggle from '../ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../ui/IosForm';
import { IconX } from '../ui/icons';
import { useIosAlert } from '../alerts';
import { formatMoney } from '../../utils/format';

const PanelCarrito = () => {
  const { confirm } = useIosAlert();
  const { caja, cierreHoy, esDeHoy, openAbrir, openReabrir } = useCaja();
  const { usuario } = useAutenticacion();
  const {
    cart,
    removeFromCart,
    updateCartItem,
    clearCart,
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
  } = useCarrito();

  const handleVaciar = async () => {
    const ok = await confirm({
      icon: 'warning',
      title: '¿Vaciar el carrito?',
      message: 'Se quitan todos los productos de la venta en curso.',
      confirmText: 'Vaciar',
      destructive: true,
    });
    if (ok) clearCart();
  };

  return (
    <aside className="w-full h-full flex flex-col bg-ios-surface/95 backdrop-blur-2xl border-l border-ios-separator/40">
      <div className="px-4 pt-6 pb-3 border-b border-ios-separator/40 flex items-start justify-between gap-2 shrink-0">
        <div>
          <h2 className="text-[17px] font-bold text-ios-label tracking-tight">Carrito</h2>
          <p className="text-[11px] text-ios-tertiary mt-0.5">
            {cart.length} producto{cart.length === 1 ? '' : 's'} en la venta
          </p>
        </div>
        <button
          onClick={handleVaciar}
          className="shrink-0 text-[11px] text-ios-red border border-ios-red/30 px-2.5 py-1 rounded-ios-pill hover:bg-ios-red/10 transition-colors font-semibold"
        >
          Vaciar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cart.map((item, idx) => (
          <div key={idx} className="bg-ios-surface rounded-2xl border border-ios-separator/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ios-label leading-tight min-w-0">{item.nombre}</p>
              <button onClick={() => removeFromCart(idx)} className="text-ios-red shrink-0 p-0.5">
                <IconX className="w-4 h-4" />
              </button>
            </div>
            {(item.talle || item.color) && (
              <p className="text-[11px] text-ios-tertiary mt-0.5">
                {[item.talle, item.color].filter(Boolean).join(' / ')}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 mt-2">
              <input
                type="text"
                inputMode="numeric"
                value={item.cantidad}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d+$/.test(v)) updateCartItem(idx, 'cantidad', v);
                }}
                className="w-14 px-2 py-1 text-center bg-ios-surface2 rounded-lg text-ios-label text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[11px] text-ios-tertiary">{formatMoney(item.precio)}</span>
              <span className="text-sm font-semibold text-ios-label tabular-nums">
                {formatMoney(item.precio * (Number(item.cantidad) || 0))}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-ios-separator/40 px-4 py-3 space-y-3 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <IosField label="Empleado">
            <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-secondary text-sm truncate">
              {sellEmpleado || '—'}
            </div>
          </IosField>
          <IosField label="Descuento">
            <IosInput
              type="text"
              inputMode="numeric"
              value={sellDescuento}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100)) setSellDescuento(v);
              }}
              placeholder="% (0-100)"
            />
          </IosField>
        </div>

        <div>
          <p className="text-[12px] text-ios-secondary font-medium mb-1.5">Pago</p>
          <div className="flex gap-1.5">
            {metodos.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetodoPago(m.key)}
                className={`flex-1 px-1.5 py-2 text-[12px] rounded-ios-control border transition-all ios-btn-press font-medium ${
                  sellMetodoPago === m.key
                    ? m.activeCls
                    : 'bg-ios-surface2 text-ios-tertiary border-transparent hover:bg-ios-surface3'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
          <span className="flex items-center gap-2.5">
            <IosToggle checked={sellSplit} onChange={toggleSplit} />
            <span className="text-[13px] text-ios-secondary font-medium">Dividir pago</span>
          </span>
          {sellSplit && <span className="text-[12px] text-ios-tertiary">{formatMoney(sellMonto1)}</span>}
        </label>

        {sellSplit && (
          <div className="space-y-2 pt-2 border-t border-ios-separator/40">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-ios-tint/10 rounded-ios-control">
              <span className="text-[12px] font-semibold text-ios-tint">
                {metodos.find((m) => m.key === sellMetodoPago)?.label}
              </span>
              <span className="text-[12px] text-ios-label font-mono">{formatMoney(sellMonto1)}</span>
            </div>
            <div className="flex gap-2 items-center">
              <IosSelect value={sellMetodo2} onChange={(e) => setSellMetodo2(e.target.value)} className="flex-1">
                {metodos
                  .filter((m) => m.key !== sellMetodoPago)
                  .map((m) => (
                    <option key={m.key} value={m.key} className="bg-ios-surface2">{m.label}</option>
                  ))}
              </IosSelect>
              <input
                type="text"
                inputMode="numeric"
                value={sellMonto2}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setSellMonto2(v);
                }}
                className="w-20 px-2 py-2 bg-ios-surface2 rounded-ios-control text-ios-label text-sm text-right focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {descuentoNum > 0 && (
            <span className="text-[12px] text-ios-green/90 font-medium">Desc. {descuentoNum}%</span>
          )}
          <span className="ml-auto text-[13px] text-ios-secondary font-semibold">
            Total: <span className="text-ios-label text-[17px] font-bold">{formatMoney(finalTotal)}</span>
          </span>
        </div>

        {!caja && cierreHoy && (
          <div className="rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
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
          <div className="rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
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
          <div className="rounded-2xl px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            La caja abierta es del {new Date(caja.fecha).toLocaleDateString('es-AR')}. Cerrála desde Ventas para poder vender.
          </div>
        )}

        <IosButton variant="tinted" onClick={confirmSale} disabled={sellSaving || !caja || !esDeHoy} className="w-full">
          {sellSaving ? 'Guardando…' : 'Confirmar Venta'}
        </IosButton>
      </div>
    </aside>
  );
};

export default PanelCarrito;
