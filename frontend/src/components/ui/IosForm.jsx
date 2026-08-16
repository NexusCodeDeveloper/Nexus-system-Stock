import { IconChevronDown, IconChevronRight } from './icons';

const fieldCls =
  'w-full px-3.5 py-[9px] bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm';

export const IosField = ({ label, required, children, hint }) => (
  <div>
    {label && (
      <label className="block text-[13px] font-medium text-ios-secondary mb-1.5">
        {label}
        {required && <span className="text-ios-red ml-0.5">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="mt-1 text-xs text-ios-tertiary">{hint}</p>}
  </div>
);

export const IosInput = ({ className = '', ...props }) => (
  <input {...props} className={`${fieldCls} ${className}`} />
);

export const IosSelect = ({ className = '', children, ...props }) => (
  <div className="relative">
    <select
      {...props}
      className={`${fieldCls} appearance-none pr-9 cursor-pointer ${className}`}
    >
      {children}
    </select>
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ios-tertiary">
      <IconChevronDown className="w-4 h-4" />
    </span>
  </div>
);

export const IosTextArea = ({ className = '', ...props }) => (
  <textarea {...props} className={`${fieldCls} resize-none ${className}`} />
);

export const IosLabel = ({ children, tint = 'text-ios-green' }) => (
  <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${tint}`}>{children}</span>
);

export const IosCardGroup = ({ children, className = '', title }) => (
  <div className={className}>
    {title && (
      <p className="text-[13px] uppercase tracking-wide text-ios-tertiary font-medium ml-4 mb-2">{title}</p>
    )}
    <div className="bg-ios-surface rounded-3xl overflow-hidden divide-y divide-ios-separator/50">{children}</div>
  </div>
);

export const IosRow = ({ children, onClick, className = '', chevron = false }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3.5 bg-transparent transition-colors ${onClick ? 'cursor-pointer active:bg-ios-hover/10' : ''} ${className}`}
  >
    {children}
    {chevron && <IconChevronRight className="w-4 h-4 text-ios-tertiary shrink-0 ml-auto" />}
  </div>
);

export default IosField;