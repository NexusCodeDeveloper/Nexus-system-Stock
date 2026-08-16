const IosSegmented = ({ options, value, onChange, className = '' }) => (
  <div className={`inline-flex bg-ios-surface2 rounded-[9px] p-[2px] ${className}`}>
    {options.map((opt) => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const val = typeof opt === 'string' ? opt : opt.value;
      const active = value === val;
      return (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`ios-btn-press flex-1 px-3 py-1.5 text-[13px] font-semibold rounded-[7px] transition-all duration-150 ${
            active ? 'bg-ios-surface3 text-ios-label shadow-[0_1px_3px_rgba(0,0,0,0.4)]' : 'text-ios-tertiary'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export default IosSegmented;