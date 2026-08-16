import { useState, useEffect } from 'react';
import { createReturn } from '../../api/returns';
import { exchangeProduct, getProducts } from '../../api/products';
import { useIosAlert } from '../alerts';
import IosModal from '../ui/IosModal';
import IosSearch from '../ui/IosSearch';
import IosToggle from '../ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../ui/IosForm';

const variantLabel = (v) => [v.talle, v.color].filter(Boolean).join(' / ') || 'Base';

const formatMoney = (n) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

const getItemId = (item) => item?.producto?._id || item?.producto;

const getItemNombre = (item) => item?.producto?.nombre || item?.nombre || 'Producto';

const getItems = (sale) =>
  (sale.items && sale.items.length > 0
    ? sale.items
    : [{ producto: sale.producto, cantidad: sale.cantidad, precio: sale.precio, talle: sale.talle, color: '', subtotal: sale.total }]);

const ReturnForm = ({ sale, open, onClose, onDone, defaultExchange = false }) => {
  const { show: alert, toast } = useIosAlert();

  const [products, setProducts] = useState([]);
  const [itemIdx, setItemIdx] = useState(0);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [otroMotivo, setOtroMotivo] = useState('');
  const [exchangeActivo, setExchangeActivo] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeTarget, setExchangeTarget] = useState(null);
  const [exchangeCantidad, setExchangeCantidad] = useState('1');
  const [exchangeVariantIdx, setExchangeVariantIdx] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [saving, setSaving] = useState(false);

  const items = sale ? getItems(sale) : [];
  const item = items[itemIdx] || items[0] || {};
  const maxCantidad = Number(item.cantidad) || 0;

  useEffect(() => {
    if (open && sale) {
      setItemIdx(0);
      setCantidad(String(sale.items?.[0]?.cantidad || 1));
      setMotivo('');
      setOtroMotivo('');
      setExchangeActivo(defaultExchange);
      setExchangeSearch('');
      setExchangeTarget(null);
      setExchangeCantidad('1');
      setExchangeVariantIdx('');
      setMetodoPago(sale.pagos?.[0]?.metodo || 'efectivo');
      if (products.length === 0) {
        getProducts()
          .then((res) => setProducts(res.data || []))
          .catch(() => {});
      }
    }
  }, [open, sale]);

  const selectItem = (idx) => {
    setItemIdx(idx);
    setCantidad(String(items[idx]?.cantidad || 1));
  };

  const cantidadDevolver = Number(cantidad) || 0;
  const cantidadCargar = Number(exchangeCantidad) || 0;
  const devolverValor = Math.round((Number(item.precio) || 0) * cantidadDevolver * 100) / 100;
  const cargarValor = exchangeTarget
    ? Math.round((Number(exchangeTarget.precio) || 0) * cantidadCargar * 100) / 100
    : 0;
  const diferencia = Math.round((cargarValor - devolverValor) * 100) / 100;

  const filteredExchange = products.filter(
    (p) =>
      p._id !== getItemId(item) &&
      p.nombre.toLowerCase().includes(exchangeSearch.toLowerCase())
  );

  const confirmar = async () => {
    if (saving) return;
    const motivoFinal = motivo === 'Otro' ? otroMotivo.trim() : motivo.trim();
    if (!motivoFinal) {
      alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe ingresar un motivo' });
      return;
    }
    if (cantidadDevolver < 1) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe devolver al menos 1 unidad' });
      return;
    }
    if (cantidadDevolver > maxCantidad) {
      alert({ icon: 'warning', title: 'Cantidad inválida', message: `Solo hay ${maxCantidad} unidad(es) de este producto en el ticket` });
      return;
    }

    let payload;
    let esCambio = false;
    if (exchangeActivo) {
      if (!exchangeTarget) {
        alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe elegir el producto nuevo' });
        return;
      }
      if (exchangeTarget.variants?.length > 0 && exchangeVariantIdx === '') {
        alert({ icon: 'warning', title: 'Campo requerido', message: 'Debe seleccionar la variante del producto nuevo' });
        return;
      }
      if (cantidadCargar < 1) {
        alert({ icon: 'warning', title: 'Cantidad inválida', message: 'Debe cargar al menos 1 unidad' });
        return;
      }
      const excVariant = exchangeTarget.variants?.[Number(exchangeVariantIdx)];
      esCambio = true;
      payload = {
        productoDevolver: getItemId(item),
        cantidadDevolver: cantidadDevolver,
        talleDevolver: item.talle || '',
        colorDevolver: item.color || '',
        productoCargar: exchangeTarget._id,
        cantidadCargar: cantidadCargar,
        talleCargar: excVariant?.talle || '',
        colorCargar: excVariant?.color || '',
        motivo: motivoFinal,
        sale: sale._id,
        metodoPago,
        empleado: sale.empleado,
      };
    } else {
      payload = {
        producto: getItemId(item),
        cantidad: cantidadDevolver,
        talle: item.talle || '',
        color: item.color || '',
        motivo: motivoFinal,
        sale: sale._id,
      };
    }

    setSaving(true);
    try {
      if (esCambio) {
        const res = await exchangeProduct(payload);
        if (res.data?.diferencia !== 0) {
          await alert({
            icon: 'success',
            title: 'Cambio registrado',
            buttons: [{ text: 'Listo', style: 'default' }],
            message: res.data.message,
          });
        }
      } else {
        await createReturn(payload);
      }
      onClose();
      onDone();
      toast({ message: esCambio ? 'Cambio registrado' : 'Devolución registrada' });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: err.response?.data?.message || 'Error al registrar' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <IosModal
      open={open}
      onClose={onClose}
      title="Devolución / Cambio"
      cancelText="Cancelar"
      confirmText={saving ? 'Guardando…' : exchangeActivo ? 'Confirmar Cambio' : 'Confirmar Devolución'}
      confirmVariant="destructiveTinted"
      onConfirm={confirmar}
      confirmDisabled={saving}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-ios-secondary text-sm">
          Ticket Nº <span className="text-ios-label font-semibold tabular-nums">{sale?.ticketNumero}</span> —{' '}
          <span className="text-ios-label font-semibold">{sale?.empleado}</span>
        </p>

        {items.length > 1 && (
          <IosField label="Producto a devolver" required>
            <IosSelect value={itemIdx} onChange={(e) => selectItem(Number(e.target.value))}>
              {items.map((it, i) => (
                <option key={i} value={i} className="bg-ios-surface2">
                  {getItemNombre(it)}
                  {[it.talle, it.color].filter(Boolean).join(' / ') ? ` — ${[it.talle, it.color].filter(Boolean).join(' / ')}` : ''}
                  {' '}({it.cantidad} unid.)
                </option>
              ))}
            </IosSelect>
          </IosField>
        )}

        {items.length === 1 && (
          <p className="text-ios-label font-semibold text-sm">
            {getItemNombre(item)}
            {[item.talle, item.color].filter(Boolean).join(' / ') && (
              <span className="text-ios-tertiary font-normal"> — {[item.talle, item.color].filter(Boolean).join(' / ')}</span>
            )}
            <span className="text-ios-tertiary font-normal"> · {maxCantidad} unid. · {formatMoney(item.precio)}</span>
          </p>
        )}

        <IosField label="Cantidad a devolver" hint={`Disponible en el ticket: ${maxCantidad}`}>
          <IosInput
            type="text"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d+$/.test(v)) setCantidad(v);
            }}
          />
        </IosField>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <IosToggle checked={exchangeActivo} onChange={setExchangeActivo} />
          <span className="text-sm text-ios-label font-medium">Quiero cambiarlo por otro producto</span>
        </label>

        {exchangeActivo && (
          <>
            <IosField label="Buscar producto nuevo">
              <IosSearch value={exchangeSearch} onChange={setExchangeSearch} placeholder="Escribí el nombre..." />
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
                  <span className="font-semibold">Precio:</span> {formatMoney(exchangeTarget.precio)}
                  <br />
                  <span className="font-semibold">Stock disponible:</span> {exchangeTarget.cantidad}
                </p>
                {exchangeTarget.variants?.length > 0 && (
                  <IosField label="Variante a cargar" required>
                    <IosSelect value={exchangeVariantIdx} onChange={(e) => setExchangeVariantIdx(e.target.value)}>
                      <option value="" className="bg-ios-surface2">Seleccionar...</option>
                      {exchangeTarget.variants.map((v, i) => (
                        <option key={i} value={String(i)} className="bg-ios-surface2">
                          {variantLabel(v)} (stock: {v.cantidad})
                        </option>
                      ))}
                    </IosSelect>
                  </IosField>
                )}
                <IosField label="Cantidad a cargar">
                  <IosInput
                    type="text"
                    inputMode="numeric"
                    value={exchangeCantidad}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d+$/.test(v)) setExchangeCantidad(v);
                    }}
                  />
                </IosField>

                {diferencia !== 0 && (
                  <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${
                    diferencia > 0
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                  }`}>
                    {diferencia > 0
                      ? `Diferencia a pagar: ${formatMoney(diferencia)}`
                      : `Diferencia a favor del cliente: ${formatMoney(Math.abs(diferencia))}`}
                  </div>
                )}

                {diferencia > 0 && (
                  <IosField label="Método de pago de la diferencia" required>
                    <IosSelect value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                      <option value="efectivo" className="bg-ios-surface2">Efectivo</option>
                      <option value="transferencia" className="bg-ios-surface2">Transferencia</option>
                      <option value="tarjeta" className="bg-ios-surface2">Tarjeta</option>
                    </IosSelect>
                  </IosField>
                )}
              </div>
            )}
          </>
        )}

        <IosField label="Motivo" required>
          <IosSelect value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="" className="bg-ios-surface2">Seleccionar motivo</option>
            <option value="Defectuoso" className="bg-ios-surface2">Defectuoso</option>
            <option value="Cambio de talla" className="bg-ios-surface2">Cambio de talla</option>
            <option value="Cambio de modelo" className="bg-ios-surface2">Cambio de modelo</option>
            <option value="Devolución de venta" className="bg-ios-surface2">Devolución de venta</option>
            <option value="Otro" className="bg-ios-surface2">Otro</option>
          </IosSelect>
        </IosField>

        {motivo === 'Otro' && (
          <IosField label="Detalle del motivo">
            <IosInput
              type="text"
              value={otroMotivo}
              onChange={(e) => setOtroMotivo(e.target.value)}
              placeholder="Escribí el motivo..."
            />
          </IosField>
        )}
      </div>
    </IosModal>
  );
};

export default ReturnForm;
