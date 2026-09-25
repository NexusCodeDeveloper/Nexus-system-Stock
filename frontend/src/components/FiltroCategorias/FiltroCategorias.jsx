const base = 'ios-btn-press shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-ios-pill text-sm font-medium transition-colors';

const chipCls = (seleccionada) =>
  `${base} ${
    seleccionada
      ? 'bg-ios-green/15 text-ios-green border border-ios-green/30'
      : 'bg-ios-surface2 text-ios-tertiary border border-transparent hover:bg-ios-surface3'
  }`;

const FiltroCategorias = ({ categorias, activa, onChange, className = '' }) => {
  if (!categorias?.length) return null;

  return (
    <div
      role="group"
      aria-label="Filtrar por categoría"
      className={`flex items-center gap-2 overflow-x-auto pb-0.5 ${className}`}
    >
      <button type="button" aria-pressed={!activa} onClick={() => onChange('')} className={chipCls(!activa)}>
        Todas
      </button>
      {categorias.map((c) => {
        const seleccionada = activa === c.nombre;
        return (
          <button
            key={c.nombre}
            type="button"
            aria-pressed={seleccionada}
            onClick={() => onChange(seleccionada ? '' : c.nombre)}
            className={chipCls(seleccionada)}
          >
            {c.nombre}
            <span
              className={`inline-block px-1.5 rounded-full text-[10px] font-semibold ${
                seleccionada ? 'bg-ios-green/20' : 'bg-ios-surface3'
              }`}
            >
              {c.cantidad}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default FiltroCategorias;
