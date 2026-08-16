import { useEffect } from 'react';
import { IconCheck, IconX, IconAlert } from './alertIcons';

const IosAlert = ({ alert, onClose }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const buttons = alert.buttons?.length ? alert.buttons : [{ text: 'OK', style: 'default', onPress: alert.onOk }];

  const sorted = [...buttons].sort((a, b) => {
    const rank = { cancel: 0, destructive: 1, default: 2 };
    return (rank[a.style] ?? 3) - (rank[b.style] ?? 3);
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-10">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-ios-fade" onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-[280px] bg-ios-surface rounded-ios-alert shadow-ios-alert overflow-hidden animate-ios-alert"
      >
        {alert.icon && (
          <div className="pt-5 flex justify-center">
            <span
              className={`w-[36px] h-[36px] rounded-full flex items-center justify-center ${
                alert.icon === 'success'
                  ? 'bg-ios-green/15 text-ios-green'
                  : alert.icon === 'error'
                    ? 'bg-ios-red/15 text-ios-red'
                    : 'bg-ios-orange/15 text-ios-orange'
              }`}
            >
              {alert.icon === 'success' ? (
                <IconCheck className="w-5 h-5" strokeWidth={2.4} />
              ) : alert.icon === 'error' ? (
                <IconX className="w-5 h-5" strokeWidth={2.4} />
              ) : (
                <IconAlert className="w-5 h-5" strokeWidth={2.4} />
              )}
            </span>
          </div>
        )}
        <div className={`${alert.icon ? 'pt-3' : 'pt-6'} px-4 pb-1 text-center`}>
          {alert.title && (
            <h2 className="text-[17px] font-semibold text-ios-label leading-snug px-2">{alert.title}</h2>
          )}
          {alert.message && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-ios-secondary px-3">{alert.message}</p>
          )}
          {alert.content && (
            <div className="mt-3 max-h-[45vh] overflow-y-auto px-3 text-left">{alert.content}</div>
          )}
        </div>
        <div className={`mt-4 mb-2 mx-2 overflow-hidden rounded-xl bg-ios-surface3/50 py-1`}>
          {sorted.map((b, i) => (
            <div key={i}>
              {i > 0 && <div className="h-px bg-ios-separator/60 mx-3" />}
              <button
                autoFocus={b.style === 'cancel' || i === 0}
                onClick={() => {
                  const action = b.action || b.onPress;
                  if (action) action();
                  onClose();
                }}
                className={`w-full py-[9px] px-4 text-center transition-colors active:bg-ios-hover/10 ${
                  b.style === 'destructive' ? 'text-ios-red' : 'text-ios-tint'
                } ${b.style === 'cancel' ? 'font-semibold' : 'font-medium'}`}
              >
                {b.text || b.label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IosAlert;