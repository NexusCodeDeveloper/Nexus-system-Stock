const variants = {
  primary: 'bg-gradient-to-b from-[#0E8CFF] to-ios-tint text-white shadow-[0_4px_14px_rgba(10,132,255,0.35)] hover:shadow-[0_6px_20px_rgba(10,132,255,0.45)]',
  tinted: 'bg-ios-tint/15 text-ios-tint',
  destructive: 'bg-gradient-to-b from-[#FF6A5E] to-ios-red text-white shadow-[0_4px_14px_rgba(255,69,58,0.35)]',
  destructiveTinted: 'bg-ios-red/15 text-ios-red',
  gray: 'bg-ios-surface2 text-ios-label hover:bg-ios-surface3',
  plain: 'text-ios-tint bg-transparent',
  plainDanger: 'text-ios-red bg-transparent',
};

const sizes = {
  xs: 'px-2.5 py-1 text-[13px]',
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-[15px]',
};

const IosButton = ({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }) => (
  <button
    disabled={disabled}
    className={`ios-btn-press inline-flex items-center justify-center gap-2 rounded-ios-pill font-semibold select-none disabled:opacity-50 disabled:pointer-events-none ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
    {...props}
  >
    {children}
  </button>
);

export default IosButton;