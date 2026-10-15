const variants = {
  primary: 'btn-vivo btn-vivo-azul',
  tinted: 'btn-vivo btn-vivo-verde',
  destructive: 'btn-vivo btn-vivo-rojo',
  destructiveTinted: 'btn-vivo btn-vivo-rojo',
  gray: 'btn-vivo btn-vivo-gris',
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