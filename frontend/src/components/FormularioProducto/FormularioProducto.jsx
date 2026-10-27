import { useState, useMemo, useEffect } from 'react';
import IosButton from '../ui/IosButton';
import { IconPlus, IconX, IconPrint } from '../ui/icons';
import { obtenerSiguienteCodigo } from '../../api/productos';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { printLabel } from '../../utils/printLabel';
import { variantesParaEnviar } from '../../utils/productos';
import {
  CANTIDAD,
  LIMITES,
  limitarTexto,
  PRECIO,
  STOCK_MINIMO,
  validarNumero,
  validarTexto,
} from '../../utils/validacion';

const stockPorColor = (colores, variants) => {
  if (!colores || colores.length === 0) return null;
  return colores.map((c) => ({
    color: c,
    stock: variants
      .filter((v) => v.color === c)
      .reduce((s, v) => s + (Number(v.deposito) || 0), 0),
  }));
};

const FormularioProducto = ({ initial, onSubmit, onCancel, isSubmitting: externalSubmitting }) => {
  const extractColores = (prod) => {
    if (prod?.colores?.length) return prod.colores;
    const fromVariantes = [...new Set((prod?.variantes ?? []).map((v) => v.color).filter(Boolean))];
    return fromVariantes.length ? fromVariantes : [];
  };

  const [form, setForm] = useState({
    nombre: initial?.nombre || '',
    precio: initial?.precio ?? '',
    colores: extractColores(initial),
    variants: initial?.variantes?.length
      ? initial.variantes.map((v) => ({ ...v }))
      : [],
    categoria: initial?.categoria || '',
    proveedor: initial?.proveedor || '',
    codigo: initial?.codigo || '',
    stockMinimo: initial?.stockMinimo ?? 2,
  });
  const [newColor, setNewColor] = useState('');
  const [errores, setErrores] = useState({});
  const [generandoCodigo, setGenerandoCodigo] = useState(false);

  useEffect(() => {
    if (initial) return undefined;
    let cancelado = false;
    setGenerandoCodigo(true);
    obtenerSiguienteCodigo()
      .then(({ data }) => {
        if (cancelado) return;
        setForm((f) => ({ ...f, codigo: data.codigo }));
        setErrores((e) => ({ ...e, codigo: undefined }));
      })
      .catch((err) => {
        if (cancelado) return;
        setErrores((e) => ({ ...e, codigo: obtenerMensajeErrorApi(err, 'No se pudo generar el código') }));
      })
      .finally(() => {
        if (!cancelado) setGenerandoCodigo(false);
      });
    return () => {
      cancelado = true;
    };
  }, [initial]);

  const imprimirEtiqueta = async () => {
    const ok = await printLabel({
      nombre: form.nombre,
      precio: Number(form.precio) || 0,
      codigo: form.codigo.trim(),
    });
    if (!ok) setErrores((e) => ({ ...e, codigo: 'No se pudo generar la etiqueta' }));
  };

  const groups = useMemo(() => {
    const map = {};
    if (form.colores.length === 0) map[''] = [];
    for (const c of form.colores) map[c] = [];
    for (const v of form.variants) {
      const key = v.color || '';
      if (!map[key]) map[key] = [];
      map[key].push(v);
    }
    return map;
  }, [form.colores, form.variants]);

  const stockResumen = useMemo(
    () => stockPorColor(form.colores, form.variants),
    [form.colores, form.variants]
  );

  const handleAddColor = () => {
    const c = newColor.trim();
    if (!c) return;
    const err = validarTexto(c, LIMITES.color, 'El color');
    if (err) {
      setErrores((e) => ({ ...e, colores: err }));
      return;
    }
    if (form.colores.includes(c)) {
      setNewColor('');
      return;
    }
    if (form.colores.length >= 50) {
      setErrores((e) => ({ ...e, colores: 'No se pueden agregar más de 50 colores' }));
      return;
    }
    setErrores((e) => ({ ...e, colores: undefined }));
    setForm({ ...form, colores: [...form.colores, c] });
    setNewColor('');
  };

  const handleRemoveColor = (color) => {
    setForm({
      ...form,
      colores: form.colores.filter((c) => c !== color),
      variants: form.variants.filter((v) => v.color !== color),
    });
  };

  const addVariantToColor = (color) => {
    setForm({
      ...form,
      variants: [...form.variants, { talle: '', color, cantidad: 0, deposito: '' }],
    });
  };

  const updateVariant = (index, field, value) => {
    const updated = [...form.variants];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, variants: updated });
  };

  const removeVariant = (index) => {
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) });
  };

  const totalCantidad = form.variants.reduce(
    (sum, v) => sum + (Number(v.deposito) || 0),
    0
  );
  const tieneVariantes = form.variants.length > 0;

  const validate = () => {
    const errs = {};
    const errNombre = validarTexto(form.nombre, LIMITES.nombreProducto, 'El nombre');
    const errPrecio = validarNumero(form.precio, { ...PRECIO, etiqueta: 'El precio' });
    const errCategoria = validarTexto(form.categoria, LIMITES.categoria, 'La categoría');
    const errProveedor = validarTexto(form.proveedor, LIMITES.proveedor, 'El proveedor');
    const errStockMinimo = validarNumero(form.stockMinimo, {
      ...STOCK_MINIMO,
      entero: true,
      etiqueta: 'El stock mínimo',
    });
    if (errNombre) errs.nombre = errNombre;
    if (errPrecio) errs.precio = errPrecio;
    if (errCategoria) errs.categoria = errCategoria;
    if (errProveedor) errs.proveedor = errProveedor;
    if (errStockMinimo) errs.stockMinimo = errStockMinimo;
    for (const v of form.variants) {
      const errTalle = validarTexto(v.talle, LIMITES.talle, 'El talle');
      const errDeposito = validarNumero(v.deposito, {
        min: 0,
        max: CANTIDAD.max,
        entero: true,
        etiqueta: 'La cantidad en depósito',
        requerido: false,
      });
      if (errTalle) {
        errs.variants = errTalle;
        break;
      }
      if (errDeposito) {
        errs.variants = errDeposito;
        break;
      }
    }
    const claves = form.variants.map(
      (v) => `${(v.talle || '').trim().toLowerCase()}|${(v.color || '').trim().toLowerCase()}`
    );
    if (!errs.variants && new Set(claves).size !== claves.length) {
      errs.variants = 'Hay variantes repetidas (mismo talle y color)';
    }
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      ...form,
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      proveedor: form.proveedor.trim(),
      codigo: form.codigo.trim(),
      precio: Number(form.precio),
      colores: form.colores,
      variantes: variantesParaEnviar(form.variants),
      stockMinimo: Number(form.stockMinimo),
    });
  };

  const campoCls = (campo) =>
    `w-full px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm ${
      errores[campo] ? 'ring-2 ring-ios-red/60' : ''
    }`;

  const labelCls = 'block text-[13px] text-ios-secondary font-medium mb-1.5';

  const errText = (campo) =>
    errores[campo] && <p className="text-ios-red text-xs mt-1">{errores[campo]}</p>;

  const isSubmitting = externalSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-1 sm:col-span-2">
          <label className={labelCls}>
            Nombre <span className="text-ios-red">*</span>
          </label>
          <input
            type="text"
            required
            minLength={LIMITES.nombreProducto.min}
            maxLength={LIMITES.nombreProducto.max}
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: limitarTexto(e.target.value, LIMITES.nombreProducto.max) })}
            className={campoCls('nombre')}
          />
          {errText('nombre')}
        </div>
        <div>
          <label className={labelCls}>
            Precio <span className="text-ios-red">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            required
            min={PRECIO.min}
            max={PRECIO.max}
            value={form.precio}
            onChange={(e) => setForm({ ...form, precio: limitarTexto(e.target.value, 11) })}
            className={campoCls('precio')}
          />
          {errText('precio')}
          {initial?.oferta && (
            <p className="text-ios-orange text-[11px] mt-1">
              Tiene una oferta activa (
              {initial.oferta.tipo === 'porcentaje' ? `-${initial.oferta.valor}%` : `-$${initial.oferta.valor}`}) hasta el{' '}
              {new Date(initial.oferta.hasta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              El precio de oferta se calcula sobre este precio normal.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Stock Mínimo</label>
          <input
            type="number"
            required
            min={STOCK_MINIMO.min}
            max={STOCK_MINIMO.max}
            step="1"
            value={form.stockMinimo}
            onChange={(e) => setForm({ ...form, stockMinimo: limitarTexto(e.target.value, 6) })}
            className={campoCls('stockMinimo')}
          />
          <p className="text-ios-tertiary text-[11px] mt-1">
            Cuando el stock total baje de este número, se mostrará una alerta
          </p>
          {errText('stockMinimo')}
        </div>
      </div>

      <div>
        <label className={labelCls}>Colores del producto</label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            maxLength={LIMITES.color.max}
            value={newColor}
            onChange={(e) => setNewColor(limitarTexto(e.target.value, LIMITES.color.max))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
            placeholder="Ej: Azul, Rojo..."
            className="flex-1 px-3.5 py-2.5 bg-ios-surface rounded-ios-card text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
          />
          <IosButton type="button" variant="tinted" size="sm" onClick={handleAddColor} disabled={!newColor.trim()}>
            <IconPlus className="w-3.5 h-3.5" />
            Agregar
          </IosButton>
        </div>
        {form.colores.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {form.colores.map((c) => {
              const count = groups[c]?.length || 0;
              return (
                <span
                  key={c}
                  className="inline-flex items-center justify-center gap-1.5 leading-none text-xs font-medium px-2.5 py-1 rounded-full bg-ios-surface2 border border-ios-separator/40 text-ios-secondary"
                >
                  {c}
                  <span className="text-ios-tertiary">({count})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(c)}
                    className="p-0.5 btn-icono btn-icono-rojo"
                  >
                    <IconX className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {errText('colores')}
      </div>

      {Object.keys(groups).length > 0 && (
        <div>
          <label className={`${labelCls} mb-2`}>
            Stock en depósito
          </label>
          <p className="text-ios-tertiary text-[11px] -mt-1 mb-2">
            Cargá talle y cantidad por variante; el stock entra al depósito y después lo pasás al salón. Si no agregás nada, el producto queda sin stock.
          </p>
          {errText('variants')}
          <div className="space-y-3">
            {Object.keys(groups).map((color) => {
              const idxs = form.variants
                .map((v, i) => ((v.color || '') === color ? i : -1))
                .filter((i) => i !== -1);
              return (
                <div key={color || 'base'} className="bg-ios-surface rounded-ios-card border border-ios-separator/30 p-3">
                  <p className="text-sm font-semibold text-ios-label mb-2">{color || 'Sin color (base)'}</p>
                  {idxs.length === 0 && (
                    <p className="text-xs text-ios-tertiary mb-2">
                      Sin variantes aún — agregue talle y cantidad
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-ios-tertiary font-semibold mb-1.5">Detalle</p>
                      <div className="space-y-2">
                        {idxs.map((i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Talle (opc.)"
                              maxLength={LIMITES.talle.max}
                              value={form.variants[i].talle}
                              onChange={(e) => updateVariant(i, 'talle', limitarTexto(e.target.value, LIMITES.talle.max))}
                              className="h-10 flex-1 min-w-0 sm:flex-none sm:w-28 px-3 bg-ios-surface rounded-ios-card text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
                            />
                            <input
                              type="number"
                              min="0"
                              max={CANTIDAD.max}
                              step="1"
                              placeholder="Cant. depósito"
                              value={form.variants[i].deposito}
                              onChange={(e) => updateVariant(i, 'deposito', limitarTexto(e.target.value, 6))}
                              className="h-10 flex-1 min-w-0 sm:flex-none w-24 px-3 bg-ios-surface rounded-ios-card text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeVariant(i)}
                              className="h-10 w-10 shrink-0 flex items-center justify-center btn-icono btn-icono-rojo rounded-lg"
                            >
                              <IconX className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addVariantToColor(color)}
                        className="mt-2 text-xs text-ios-green hover:text-ios-green dark:hover:text-ios-green/80 transition-colors font-medium"
                      >
                        + Agregar talle
                      </button>
                    </div>
                    {idxs.length > 0 && (
                      <div className="sm:w-40 shrink-0">
                        <p className="text-[10px] uppercase tracking-wider text-ios-tertiary font-semibold mb-1.5">Código</p>
                        <div className="space-y-2">
                          {idxs.map((i) => (
                            <div
                              key={i}
                              className="h-10 flex items-center px-3 rounded-ios-card bg-ios-surface2/60 text-[11px] text-ios-tertiary tabular-nums truncate"
                            >
                              {form.variants[i].codigo || 'Se asigna al guardar'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3 text-xs">
            <span className="text-ios-secondary">
              Total en depósito: <span className="text-ios-label font-semibold">{totalCantidad}</span> unidades
            </span>
            {stockResumen && (
              <span className="text-ios-tertiary">
                Por color (depósito):{' '}
                {stockResumen
                  .filter((s) => s.stock > 0)
                  .map((s) => (
                    <span key={s.color} className="text-ios-secondary">
                      {s.color}: {s.stock}{' '}
                    </span>
                  ))}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>
            Categoría <span className="text-ios-red">*</span>
          </label>
          <input
            type="text"
            required
            minLength={LIMITES.categoria.min}
            maxLength={LIMITES.categoria.max}
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: limitarTexto(e.target.value, LIMITES.categoria.max) })}
            className={campoCls('categoria')}
            placeholder="Ej: Pantalones, Remeras..."
          />
          {errText('categoria')}
        </div>
        <div>
          <label className={labelCls}>Proveedor</label>
          <input
            type="text"
            maxLength={LIMITES.proveedor.max}
            value={form.proveedor}
            onChange={(e) => setForm({ ...form, proveedor: limitarTexto(e.target.value, LIMITES.proveedor.max) })}
            className={campoCls('proveedor')}
            placeholder="Nombre del proveedor"
          />
          {errText('proveedor')}
        </div>
      </div>

      <div>
        <label className={labelCls}>Código interno</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={form.codigo}
            readOnly
            maxLength={20}
            pattern="^NC-\d{6}$"
            placeholder={generandoCodigo ? 'Generando…' : '—'}
            className={`${campoCls('codigo')} opacity-70 cursor-default`}
          />
          {!tieneVariantes && (
            <IosButton
              type="button"
              variant="tinted"
              size="sm"
              onClick={imprimirEtiqueta}
              disabled={generandoCodigo || !form.codigo.trim()}
            >
              <IconPrint className="w-3.5 h-3.5" />
              Etiqueta
            </IosButton>
          )}
        </div>
        <p className="text-ios-tertiary text-[11px] mt-1">
          {generandoCodigo
            ? 'Generando código…'
            : tieneVariantes
              ? 'Cada variante recibe su propio código (por ejemplo, NC-000123-01). Las etiquetas se imprimen desde Depósito: menú del producto → Etiqueta. Si cambiás el talle o el color de una variante, al guardar recibe un código nuevo.'
              : 'Se genera automáticamente al crear el producto y no se puede modificar.'}
        </p>
        {errText('codigo')}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <IosButton type="button" variant="gray" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </IosButton>
        <IosButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white/70" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Guardando...
            </>
          ) : initial ? 'Actualizar Producto' : 'Crear Producto'}
        </IosButton>
      </div>
    </form>
  );
};

export default FormularioProducto;