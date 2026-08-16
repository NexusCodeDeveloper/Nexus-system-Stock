import { useState, useMemo } from 'react';
import IosButton from '../ui/IosButton';
import { IconPlus, IconX } from '../ui/icons';

const stockPorColor = (colores, variants) => {
  if (!colores || colores.length === 0) return null;
  return colores.map((c) => ({
    color: c,
    stock: variants
      .filter((v) => v.color === c)
      .reduce((s, v) => s + (Number(v.cantidad) || 0), 0),
  }));
};

const ProductForm = ({ initial, onSubmit, onCancel, isSubmitting: externalSubmitting }) => {
  const extractColores = (prod) => {
    if (prod?.colores?.length) return prod.colores;
    const fromVariants = [...new Set((prod?.variants ?? []).map((v) => v.color).filter(Boolean))];
    return fromVariants.length ? fromVariants : [];
  };

  const [form, setForm] = useState({
    nombre: initial?.nombre || '',
    precio: initial?.precio ?? '',
    colores: extractColores(initial),
    variants: initial?.variants?.length
      ? initial.variants.map((v) => ({ ...v }))
      : [],
    categoria: initial?.categoria || '',
    proveedor: initial?.proveedor || '',
    stockMinimo: initial?.stockMinimo ?? 2,
  });
  const [newColor, setNewColor] = useState('');
  const [errores, setErrores] = useState({});

  const groups = useMemo(() => {
    const map = {};
    for (const c of form.colores) map[c] = [];
    for (const v of form.variants) {
      if (v.color && map[v.color]) map[v.color].push(v);
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
    if (form.colores.includes(c)) {
      setNewColor('');
      return;
    }
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
      variants: [...form.variants, { talle: '', color, cantidad: '' }],
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
    (sum, v) => sum + (Number(v.cantidad) || 0),
    0
  );

  const validate = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    if (form.precio === '' || Number(form.precio) <= 0) errs.precio = 'El precio debe ser mayor a $0';
    if (!form.categoria.trim()) errs.categoria = 'La categoría es obligatoria';
    if (form.stockMinimo === '' || Number(form.stockMinimo) < 0) errs.stockMinimo = 'El stock mínimo no puede ser negativo';
    if (form.colores.length === 0 && form.variants.length > 0) errs.colores = 'Agregue al menos un color';
    if (form.colores.length > 0 && form.variants.length === 0) errs.variants = 'Agregue al menos una variante con talle y cantidad';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const variantsValidos = form.variants
      .filter((v) => v.talle.trim())
      .map((v) => ({
        talle: v.talle.trim(),
        color: v.color,
        cantidad: Number(v.cantidad) || 0,
      }));
    onSubmit({
      ...form,
      precio: Number(form.precio),
      colores: form.colores,
      variants: variantsValidos,
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
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
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
            min="0"
            value={form.precio}
            onChange={(e) => setForm({ ...form, precio: e.target.value })}
            className={campoCls('precio')}
          />
          {errText('precio')}
        </div>
        <div>
          <label className={labelCls}>Stock Mínimo</label>
          <input
            type="number"
            required
            min="0"
            value={form.stockMinimo}
            onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })}
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
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
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
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-ios-surface2 border border-ios-separator/40 text-ios-secondary"
                >
                  {c}
                  <span className="text-ios-tertiary">({count})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(c)}
                    className="text-ios-tertiary hover:text-ios-red transition-colors"
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

      {form.colores.length > 0 && (
        <div>
          <label className={`${labelCls} mb-2`}>Variantes por color</label>
          {errText('variants')}
          <div className="space-y-3">
            {form.colores.map((color) => {
              const idxs = form.variants
                .map((v, i) => (v.color === color ? i : -1))
                .filter((i) => i !== -1);
              return (
                <div key={color} className="bg-ios-surface rounded-ios-card border border-ios-separator/30 p-3">
                  <p className="text-sm font-semibold text-ios-label mb-2">{color}</p>
                  {idxs.length === 0 && (
                    <p className="text-xs text-ios-tertiary mb-2">
                      Sin variantes aún — agregue talle y cantidad
                    </p>
                  )}
                  <div className="space-y-2">
                    {idxs.map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Talle"
                          value={form.variants[i].talle}
                          onChange={(e) => updateVariant(i, 'talle', e.target.value)}
                          className="flex-1 sm:flex-none w-24 px-3 py-2 bg-ios-surface rounded-ios-card text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="Cantidad"
                          value={form.variants[i].cantidad}
                          onChange={(e) => updateVariant(i, 'cantidad', e.target.value)}
                          className="flex-1 sm:flex-none w-24 px-3 py-2 bg-ios-surface rounded-ios-card text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariant(i)}
                          className="p-2 text-ios-red hover:bg-ios-red/10 rounded-lg transition-all"
                        >
                          <IconX className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addVariantToColor(color)}
                    className="mt-2 text-xs text-ios-green hover:text-ios-green/80 transition-colors font-medium"
                  >
                    + Agregar talle
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3 text-xs">
            <span className="text-ios-secondary">
              Total: <span className="text-ios-label font-semibold">{totalCantidad}</span> unidades
            </span>
            {stockResumen && (
              <span className="text-ios-tertiary">
                Por color:{' '}
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

      {form.colores.length === 0 && (
        <div className="py-4 text-center text-ios-tertiary text-xs border border-dashed border-ios-separator/60 rounded-ios-card">
          Agregue al menos un color para empezar a cargar variantes
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
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className={campoCls('categoria')}
            placeholder="Ej: Pantalones, Remeras..."
          />
          {errText('categoria')}
        </div>
        <div>
          <label className={labelCls}>Proveedor</label>
          <input
            type="text"
            value={form.proveedor}
            onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
            className={campoCls('proveedor')}
            placeholder="Nombre del proveedor"
          />
        </div>
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

export default ProductForm;