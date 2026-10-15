const IosSegmented = ({ options, value, onChange, className = '' }) => (
  <div role="group" className={`inline-flex bg-ios-surface2 rounded-[9px] p-[2px] ${className}`}>
    {options.map((opt) => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const val = typeof opt === 'string' ? opt : opt.value;
      const active = value === val;
      return (
        <button
          key={val}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(val)}
          className={`flex-1 px-3 py-1.5 text-[13px] font-semibold rounded-[7px] transition-all duration-150 ${
            active
              ? 'btn-vivo btn-vivo-azul'
              : 'text-ios-tertiary hover:bg-ios-hover/5 hover:text-ios-secondary active:bg-ios-hover/10'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export default IosSegmented;