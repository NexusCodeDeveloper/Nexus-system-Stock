import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { pushSoportado, getPushEstado, activarPush } from '../services/pushManager';
import { IconBell } from './ui/icons';

const LS_DISMISSED = 'push-banner-dismissed';
const LS_NEVER = 'push-banner-never';

const PushPermissionBanner = () => {
  const { user } = useAuth();
  const [estado, setEstado] = useState('cargando');

  useEffect(() => {
    if (!user || !pushSoportado()) {
      setEstado('oculto');
      return;
    }
    let activo = true;
    getPushEstado().then((e) => {
      if (!activo) return;
      if (e.suscrito) {
        setEstado('oculto');
        return;
      }
      if (e.permiso === 'granted') {
        setEstado('oculto');
        return;
      }
      if (e.permiso === 'denied') {
        setEstado('denegado');
        return;
      }
      try {
        if (localStorage.getItem(LS_NEVER)) {
          setEstado('oculto');
          return;
        }
        const ultimo = Number(localStorage.getItem(LS_DISMISSED) || 0);
        if (Date.now() - ultimo < 3 * 24 * 60 * 60 * 1000) {
          setEstado('oculto');
          return;
        }
      } catch {
        /* ignore */
      }
      setEstado('promo');
    });
    return () => {
      activo = false;
    };
  }, [user]);

  if (estado === 'cargando' || estado === 'oculto') return null;

  const activar = async () => {
    const res = await activarPush();
    if (res.ok) {
      setEstado('oculto');
    } else if (res.motivo === 'denied' || res.motivo === 'default') {
      setEstado('denegado');
    }
  };

  const ahoraNo = () => {
    try {
      localStorage.setItem(LS_DISMISSED, String(Date.now()));
    } catch {
      /* ignore */
    }
    setEstado('oculto');
  };

  const noPreguntar = () => {
    try {
      localStorage.setItem(LS_NEVER, '1');
    } catch {
      /* ignore */
    }
    setEstado('oculto');
  };

  if (estado === 'denegado') {
    return (
      <div className="fixed bottom-20 md:bottom-6 inset-x-4 z-[70] flex justify-center">
        <div className="max-w-md w-full bg-ios-surface/95 backdrop-blur-2xl border border-ios-separator/40 rounded-2xl shadow-ios-alert px-4 py-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-ios-red/15 text-ios-red flex items-center justify-center shrink-0">
            <IconBell className="w-4 h-4" strokeWidth={2} />
          </span>
          <p className="text-[13px] text-ios-secondary leading-snug flex-1">
            Notificaciones bloqueadas. Activá los permisos del navegador para recibir los movimientos.
          </p>
          <button
            onClick={() => setEstado('oculto')}
            className="text-xs text-ios-tint font-semibold shrink-0"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 inset-x-4 z-[70] flex justify-center">
      <div className="max-w-md w-full bg-ios-surface/95 backdrop-blur-2xl border border-ios-separator/40 rounded-2xl shadow-ios-alert px-4 py-3.5 animate-ios-modal">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-ios-tint/15 text-ios-tint flex items-center justify-center shrink-0">
            <IconBell className="w-4 h-4" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-ios-label">Activá las notificaciones</p>
            <p className="text-[12px] text-ios-secondary mt-0.5 leading-snug">
              Enterate al instante de cada venta, cierre de caja, retiro y aviso.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={noPreguntar}
            className="flex-1 px-3 py-2 rounded-ios-control text-xs text-ios-tertiary font-medium bg-ios-surface2 hover:bg-ios-surface3 transition-colors"
          >
            No volver a preguntar
          </button>
          <button
            onClick={ahoraNo}
            className="flex-1 px-3 py-2 rounded-ios-control text-xs text-ios-secondary font-medium bg-ios-surface2 hover:bg-ios-surface3 transition-colors"
          >
            Ahora no
          </button>
          <button
            onClick={activar}
            className="flex-1 px-3 py-2 rounded-ios-control text-xs font-semibold text-white bg-ios-tint hover:bg-blue-500 transition-colors"
          >
            Activar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PushPermissionBanner;