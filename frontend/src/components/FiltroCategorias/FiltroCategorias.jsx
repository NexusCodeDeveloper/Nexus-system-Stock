const base = 'shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-ios-pill text-sm transition-all duration-150 active:scale-[0.97]';

const chipCls = (seleccionada) =>
  `${base} ${
    seleccionada
      ? 'btn-vivo btn-vivo-verde font-semibold'
      : 'btn-vivo btn-vivo-gris font-medium'
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
              className={`inline-flex items-center justify-center leading-none px-1.5 rounded-full text-[10px] font-semibold ${
                seleccionada ? 'bg-white/25' : 'bg-white/20'
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
