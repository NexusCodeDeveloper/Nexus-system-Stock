import { useState, useEffect } from 'react';
import { IconCheck } from '../ui/icons';

const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const Spinner = () => (
  <svg className="w-7 h-7 text-ios-tint animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const WelcomeOverlay = () => {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const doneTimer = setTimeout(() => setStatus('done'), 2000);
    const closeTimer = setTimeout(() => {
      setClosing(true);
      setTimeout(() => setVisible(false), 200);
    }, 3500);

    return () => {
      clearTimeout(doneTimer);
      clearTimeout(closeTimer);
    };
  }, []);

  const dismiss = () => {
    if (closing || !visible) return;
    setClosing(true);
    setTimeout(() => setVisible(false), 200);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-2xl flex items-center justify-center z-[100] cursor-pointer"
      style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.25s ease-out' }}
      onClick={dismiss}
    >
      <div
        className="bg-ios-surface/95 border border-ios-separator/50 rounded-[28px] shadow-ios-alert p-10 w-full max-w-sm mx-4 text-center animate-ios-centered"
        style={{ opacity: closing ? 0 : 1, transform: closing ? 'scale(0.95)' : 'scale(1)', transition: 'opacity 0.25s ease-out, transform 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[26px] text-ios-label font-bold tracking-tight mb-8">
          {getGreeting()}
        </p>

        <div className="flex flex-col items-center gap-4 min-h-[70px]">
          <div className="w-14 h-14 rounded-full bg-ios-surface2 border border-ios-separator/40 flex items-center justify-center">
            {status === 'loading' ? <Spinner /> : <span className="text-ios-green"><IconCheck className="w-6 h-6" strokeWidth={2.4} /></span>}
          </div>
          <p className="text-ios-secondary text-sm font-medium">
            {status === 'loading' ? 'Cargando stock de NexusCode...' : 'Listo'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeOverlay;