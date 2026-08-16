const LoadingSpinner = ({ size = 'h-8 w-8', label = true }) => (
  <div className="flex flex-col justify-center items-center py-12 gap-3">
    <div className={`animate-spin rounded-full ${size} border-[2.5px] border-ios-surface2 border-t-ios-tint border-b-ios-tint`} />
    {label && <p className="text-xs text-ios-tertiary font-medium">Cargando…</p>}
  </div>
);

export default LoadingSpinner;