import { useEffect, useRef, useState } from 'react';
import { IconX, IconSun } from '../ui/icons';
import { pushModal, popModal, esTopModal } from '../ui/IosModal';

const beep = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1250;
    gain.gain.value = 0.07;
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        ctx.close();
      } catch {
        /* ignore */
      }
    }, 110);
  } catch {
    /* el beep es opcional */
  }
};

const vibrar = () => {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* opcional */
  }
};

const mensajeError = (error) => {
  const nombre = error?.name || '';
  const texto = String(error?.message || '');
  if (!window.isSecureContext) {
    return 'La cámara solo funciona en conexiones seguras (HTTPS o localhost).';
  }
  if (nombre === 'NotAllowedError' || texto.toLowerCase().includes('permission')) {
    return 'Permiso de cámara denegado. Habilitá la cámara para este sitio e intentá de nuevo.';
  }
  if (nombre === 'NotFoundError' || texto.toLowerCase().includes('device not found')) {
    return 'No se encontró una cámara en este dispositivo.';
  }
  return 'No se pudo iniciar la cámara. Probá de nuevo.';
};

const ScannerModal = ({ open, onClose, onLeer, continuo = false, titulo = 'Escanear código' }) => {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const ultimoRef = useRef({ codigo: '', ts: 0 });
  const onLeerRef = useRef(onLeer);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [linterna, setLinterna] = useState(false);

  onLeerRef.current = onLeer;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const entrada = pushModal(() => onCloseRef.current?.());
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (!esTopModal(entrada)) return;
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      popModal(entrada);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelado = false;
    setError('');
    setListo(false);
    setLinterna(false);
    ultimoRef.current = { codigo: '', ts: 0 };

    const iniciar = async () => {
      if (!window.isSecureContext) {
        setError(mensajeError({}));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara.');
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!result || cancelado) return;
            const codigo = result.getText();
            const ahora = Date.now();
            if (codigo === ultimoRef.current.codigo && ahora - ultimoRef.current.ts < 1500) return;
            ultimoRef.current = { codigo, ts: ahora };
            beep();
            vibrar();
            onLeerRef.current?.(codigo);
            if (!continuo) onCloseRef.current?.();
          }
        );
        if (cancelado) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setListo(true);
      } catch (err) {
        if (!cancelado) setError(mensajeError(err));
      }
    };

    iniciar();

    return () => {
      cancelado = true;
      try {
        controlsRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    };
  }, [open, continuo]);

  const alternarLinterna = async () => {
    try {
      const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
      if (!track) return;
      const capacidades = track.getCapabilities?.() || {};
      if (!capacidades.torch) return;
      await track.applyConstraints({ advanced: [{ torch: !linterna }] });
      setLinterna((v) => !v);
    } catch {
      /* linterna opcional */
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-ios-surface rounded-[28px] overflow-hidden border border-ios-separator/40 shadow-ios-alert">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ios-separator/40">
          <p className="text-ios-label font-semibold">{titulo}</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-ios-hover/10 text-ios-secondary transition-colors"
            aria-label="Cerrar escáner"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-square sm:aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-1/3 border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {!listo && !error && (
            <p className="absolute bottom-3 inset-x-0 text-center text-white/80 text-xs">Iniciando cámara…</p>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-white/90 text-sm leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center gap-3">
          <p className="text-[12px] text-ios-tertiary flex-1">
            {continuo ? 'Modo continuo: podés escanear varios códigos seguidos.' : 'Apuntá al código de barras o QR.'}
          </p>
          <button
            type="button"
            onClick={alternarLinterna}
            className="p-2 rounded-full bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3 transition-colors"
            aria-label="Linterna"
          >
            <IconSun className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScannerModal;
