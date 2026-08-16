import { IconMagnifyingGlass, IconX } from './icons';

const IosSearch = ({ value, onChange, placeholder = 'Buscar', className = '', autoFocus }) => (
  <div className={`relative ${className}`}>
    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ios-tertiary">
      <IconMagnifyingGlass className="w-4 h-4" />
    </div>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full pl-9 pr-8 py-2 bg-ios-surface rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm"
    />
    {value && (
      <button
        onClick={() => onChange('')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ios-tertiary hover:text-ios-secondary p-1"
        aria-label="Limpiar búsqueda"
      >
        <IconX className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

export default IosSearch;