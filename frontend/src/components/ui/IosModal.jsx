import { useEffect, useRef, useState } from 'react';
import IosButton from './IosButton';
import { IconX } from './icons';

const isMobileViewport = () => window.matchMedia('(max-width: 767px)').matches;

const modalStack = [];

export const pushModal = (onClose) => {
  const entrada = { onClose };
  modalStack.push(entrada);
  return entrada;
};

export const popModal = (entrada) => {
  const idx = modalStack.indexOf(entrada);
  if (idx !== -1) modalStack.splice(idx, 1);
};

export const esTopModal = (entrada) => modalStack[modalStack.length - 1] === entrada;

const IosModal = ({
  open,
  onClose,
  title,
  children,
  footer,
  confirmText = 'Confirmar',
  onConfirm,
  confirmVariant = 'primary',
  confirmDisabled = false,
  cancelText = 'Cancelar',
  showCancel = true,
  showClose = false,
  maxWidth = 'max-w-lg',
}) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && isMobileViewport());
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const entrada = pushModal(() => onCloseRef.current?.());
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (!esTopModal(entrada)) return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      popModal(entrada);
      if (modalStack.length === 0) document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previo = document.activeElement;
    const node = dialogRef.current;
    if (node && !node.contains(document.activeElement)) node.focus();
    return () => {
      if (previo instanceof HTMLElement && document.contains(previo)) previo.focus();
    };
  }, [open]);

  const atraparFoco = (e) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const primero = focusables[0];
    const ultimo = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px] animate-ios-fade" onClick={onClose} />

      {isMobile ? (
        /* Mobile: bottom sheet */
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Diálogo'}
            tabIndex={-1}
            onKeyDown={atraparFoco}
            className="w-full bg-ios-surface/95 backdrop-blur-2xl shadow-ios-sheet rounded-t-[28px] overflow-hidden max-h-[92dvh] flex flex-col animate-ios-sheet-up focus:outline-none"
          >
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-9 h-[5px] rounded-full bg-ios-surface3" />
            </div>
            {title && (
              <div className="px-5 pt-3 pb-1 shrink-0 relative">
                <h2 className="text-[17px] font-semibold text-ios-label text-center leading-snug">{title}</h2>
                {showClose && (
                  <button
                    onClick={onClose}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ios-surface2 flex items-center justify-center text-ios-tertiary hover:text-ios-label transition-colors"
                    aria-label="Cerrar"
                  >
                    <IconX className="w-4 h-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            )}
            <div className="px-5 pt-3 pb-4 overflow-y-auto flex-1">{children}</div>
            {(footer || onConfirm) && (
              <div className="px-5 pb-6 pt-2 border-t border-ios-separator/50 shrink-0 safe-bottom">
                {(footer || (
                  <div className="flex gap-3">
                    {showCancel && (
                      <IosButton variant="gray" onClick={onClose} className="flex-1 py-3">
                        {cancelText}
                      </IosButton>
                    )}
                    <IosButton variant={confirmVariant} onClick={onConfirm} className="flex-1 py-3" disabled={confirmDisabled}>
                      {confirmText}
                    </IosButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Desktop centered modal */
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Diálogo'}
            tabIndex={-1}
            onKeyDown={atraparFoco}
            className={`w-full ${maxWidth} bg-ios-surface rounded-ios-alert shadow-ios-alert overflow-hidden animate-ios-centered max-h-[90vh] flex flex-col border border-white/[0.07] focus:outline-none`}
          >
            {title && (
              <div className="px-6 pt-5 pb-1 shrink-0 relative">
                <h2 className="text-[17px] font-semibold text-ios-label leading-snug">{title}</h2>
                {showClose && (
                  <button
                    onClick={onClose}
                    className="absolute right-5 top-4 w-8 h-8 rounded-full bg-ios-surface2 flex items-center justify-center text-ios-tertiary hover:text-ios-label transition-colors"
                    aria-label="Cerrar"
                  >
                    <IconX className="w-4 h-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            )}
            <div className="px-6 pt-3 pb-4 overflow-y-auto flex-1">{children}</div>
            {(footer || onConfirm) && (
              <div className="px-6 py-4 border-t border-ios-separator/50 shrink-0">
                {(footer || (
                  <div className="flex gap-3">
                    {showCancel && (
                      <IosButton variant="gray" onClick={onClose} className="flex-1 py-3">
                        {cancelText}
                      </IosButton>
                    )}
                    <IosButton variant={confirmVariant} onClick={onConfirm} className="flex-1 py-3" disabled={confirmDisabled}>
                      {confirmText}
                    </IosButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IosModal;