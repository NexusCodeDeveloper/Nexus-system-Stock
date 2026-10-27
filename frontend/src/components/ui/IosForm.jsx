import { useId } from 'react';
import { IconChevronDown } from './icons';

const fieldCls =
  'w-full px-3.5 py-[9px] bg-ios-surface2 rounded-ios-control text-ios-label placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-tint/40 transition-all text-sm';

export const IosField = ({ label, required, children, hint, error }) => {
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
      {error && <p className="mt-1 text-xs text-ios-red font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-ios-tertiary">{hint}</p>}
    </div>
  );
};

const invalidCls = (invalid) => (invalid ? 'ring-2 ring-ios-red/60' : '');

export const IosInput = ({ className = '', invalid = false, maxLength, onChange, ...props }) => {
  const handleChange = (event) => {
    if (maxLength && event.target.value.length > maxLength) {
      event.target.value = event.target.value.slice(0, maxLength);
    }
    onChange?.(event);
  };
  return (
    <input
      {...props}
      maxLength={maxLength}
      onChange={handleChange}
      aria-invalid={invalid || undefined}
      className={`${fieldCls} ${invalidCls(invalid)} ${className}`}
    />
  );
};

export const IosSelect = ({ className = '', wrapperClassName = '', children, invalid = false, ...props }) => (
  <div className={`relative ${wrapperClassName || className}`}>
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={`${fieldCls} appearance-none pr-9 cursor-pointer ${invalidCls(invalid)}`}
    >
      {children}
    </select>
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ios-tertiary">
      <IconChevronDown className="w-4 h-4" />
    </span>
  </div>
);

export const IosTextArea = ({ className = '', invalid = false, maxLength, onChange, ...props }) => {
  const handleChange = (event) => {
    if (maxLength && event.target.value.length > maxLength) {
      event.target.value = event.target.value.slice(0, maxLength);
    }
    onChange?.(event);
  };
  return (
    <textarea
      {...props}
      maxLength={maxLength}
      onChange={handleChange}
      aria-invalid={invalid || undefined}
      className={`${fieldCls} resize-none ${invalidCls(invalid)} ${className}`}
    />
  );
};

export default IosField;