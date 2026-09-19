import { useEffect, useState } from 'react';
import { useAutenticacion } from '../context/AutenticacionContext';
import { pushSoportado, getPushEstado, activarPush } from '../services/GestorPush';
import { IconBell } from './ui/icons';
import { getItem, setItem } from '../utils/storage';

const LS_DISMISSED = 'push-banner-dismissed';
const LS_NEVER = 'push-banner-never';

const BannerPermisoPush = () => {
  const { usuario } = useAutenticacion();
  const [estado, setEstado] = useState('cargando');

  useEffect(() => {
    if (!usuario || !pushSoportado()) {
      setEstado('oculto');
      return;
    }
    let activo = true;
    getPushEstado()
      .then((e) => {
        if (!activo) return;
        if (!e.soportado || e.suscrito) {
          setEstado('oculto');
          return;
        }
        if (e.permiso === 'denied') {
          setEstado('denegado');
          return;
        }
        if (getItem(LS_NEVER)) {
          setEstado('oculto');
          return;
        }
        const ultimo = Number(getItem(LS_DISMISSED) || 0);
        if (Date.now() - ultimo < 3 * 24 * 60 * 60 * 1000) {
          setEstado('oculto');
          return;
        }
        setEstado('promo');
      })
      .catch(() => {
        if (activo) setEstado('oculto');
      });
    return () => {
      activo = false;
    };
  }, [usuario]);

  if (estado === 'cargando' || estado === 'oculto') return null;

  const activar = async () => {
    try {
      const res = await activarPush();
      if (res.ok) {
        setEstado('oculto');
      } else if (res.motivo === 'denied') {
        setEstado('denegado');
      } else {
        setEstado('oculto');
      }
    } catch {
      setEstado('oculto');
    }
  };

  const ahoraNo = () => {
    setItem(LS_DISMISSED, String(Date.now()));
    setEstado('oculto');
  };

  const noPreguntar = () => {
    setItem(LS_NEVER, '1');
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

export default BannerPermisoPush;