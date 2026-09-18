import { useId } from 'react';
import { IconChevronDown } from './icons';

const fieldCls =
  'w-full px-3.5 py-[9px] bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm';

export const IosField = ({ label, required, children, hint }) => {
  const labelId = useId();
  return (
    <div>
      {label && (
        <span id={labelId} className="block text-[13px] font-medium text-ios-secondary mb-1.5">
          {label}
          {required && <span className="text-ios-red ml-0.5">*</span>}
        </span>
      )}
      <div role="group" aria-labelledby={label ? labelId : undefined}>{children}</div>
      {hint && <p className="mt-1 text-xs text-ios-tertiary">{hint}</p>}
    </div>
  );
};

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

export default IosField;