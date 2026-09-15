import { IconCamera } from '../ui/icons';

const ScannerButton = ({ onClick, title = 'Escanear con la cámara', className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-ios-control bg-ios-surface text-ios-secondary border border-ios-separator/40 hover:bg-ios-surface2 active:scale-95 transition-all ${className}`}
  >
    <IconCamera className="w-4 h-4" />
  </button>
);

export default ScannerButton;
