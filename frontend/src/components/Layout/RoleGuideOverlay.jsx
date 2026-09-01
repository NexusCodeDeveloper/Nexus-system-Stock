import { useState, useEffect } from 'react';
import IosButton from '../ui/IosButton';
import { IconTile, IconBell, IconCheck, IconPencil, IconList } from '../ui/icons';
import { useAuth } from '../../context/AuthContext';

const HOURS_24 = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'bn_guide_notifs_';

const contenido = {
  admin: [
    {
      key: 'que-es',
      icon: IconBell,
      gradient: 'from-cyan-500 to-sky-600',
      title: '¿Qué es?',
      desc: 'El sistema de Notificaciones te deja enviar avisos a tus empleados: tareas como limpiar la tienda, pagos pendientes, recordatorios, etc.',
    },
    {
      key: 'como-funciona',
      icon: IconList,
      gradient: 'from-sky-500 to-blue-600',
      title: 'Cómo funciona',
      desc: 'Creás un aviso con título y descripción. Al instante aparece el número de pendientes en el botón Notificaciones y una tarjeta abajo a la derecha en la pantalla de tus empleados.',
    },
    {
      key: 'que-podes-hacer',
      icon: IconPencil,
      gradient: 'from-indigo-500 to-purple-600',
      title: 'Lo que podés hacer',
      desc: 'Crear, editar y eliminar avisos, y reabrirlos si el trabajo quedó mal hecho. Cuando un empleado lo marca como realizado, ves quién lo hizo y su comentario.',
    },
  ],
  empleado: [
    {
      key: 'que-es',
      icon: IconBell,
      gradient: 'from-cyan-500 to-sky-600',
      title: '¿Qué es?',
      desc: 'El sistema de Notificaciones es el canal del dueño para darte tareas: limpiar la tienda, pagos pendientes, recordatorios, etc.',
    },
    {
      key: 'como-funciona',
      icon: IconList,
      gradient: 'from-sky-500 to-blue-600',
      title: 'Cómo funciona',
      desc: 'Cuando hay un aviso nuevo, aparece un número en el botón Notificaciones y una tarjeta abajo a la derecha. Entrá a la sección y tocá el aviso para leerlo completo.',
    },
    {
      key: 'que-podes-hacer',
      icon: IconCheck,
      gradient: 'from-emerald-500 to-teal-600',
      title: 'Lo que podés hacer',
      desc: 'Leer los avisos, marcarlos como realizado indicando quién hizo la tarea (obligatorio) y dejar un comentario contando cómo quedó el trabajo.',
    },
  ],
};

const readState = (key) => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.firstSeen === 'number') return parsed;
  } catch {
    /* formato viejo (timestamp plano): ya visto, no molestar */
  }
  localStorage.removeItem(key);
  return null;
};

const RoleGuideOverlay = () => {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  const rol = user?.rol === 'admin' ? 'admin' : 'empleado';
  const items = contenido[rol];
  const key = KEY_PREFIX + rol;

  useEffect(() => {
    if (!user) return;
    const state = readState(key);
    if (!state) {
      localStorage.setItem(key, JSON.stringify({ firstSeen: Date.now(), dismissed: false }));
      setVisible(true);
      return;
    }
    if (state.dismissed) return;
    if (Date.now() - state.firstSeen < HOURS_24) {
      setVisible(true);
    } else {
      localStorage.removeItem(key);
    }
  }, [user, rol, key]);

  const dismiss = () => {
    localStorage.setItem(key, JSON.stringify({ firstSeen: Date.now(), dismissed: true }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-2xl flex items-center justify-center z-[100] px-4 py-6"
      onClick={dismiss}
    >
      <div
        className="bg-ios-surface/95 border border-ios-separator/50 rounded-[28px] shadow-ios-alert w-full max-w-md flex flex-col max-h-[86dvh] animate-ios-centered overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-6 px-6 pb-2 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <IconTile gradient="from-cyan-500 to-sky-600" className="w-11 h-11">
              <IconBell className="w-5 h-5 text-ios-label" strokeWidth={2} />
            </IconTile>
            <div>
              <h2 className="text-[19px] font-bold text-ios-label tracking-tight leading-tight">
                Novedad: Notificaciones
              </h2>
              <p className="text-[13px] text-ios-tertiary font-medium">
                {rol === 'admin'
                  ? 'Avisos para tus empleados, así funcionan'
                  : 'Los avisos del dueño, así funcionan'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 overflow-y-auto flex-1 space-y-1">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex gap-3 p-3 rounded-2xl bg-ios-surface2/40 border border-transparent active:bg-ios-hover/5 transition-colors"
            >
              <IconTile gradient={item.gradient} className="w-9 h-9 shrink-0 mt-0.5">
                <item.icon className="w-4 h-4 text-ios-label" strokeWidth={2} />
              </IconTile>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ios-label">{item.title}</p>
                <p className="text-[13px] leading-relaxed text-ios-secondary mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-2 shrink-0">
          <IosButton
            variant="primary"
            size="lg"
            className="w-full"
            onClick={dismiss}
          >
            Entendido
          </IosButton>
          <p className="text-center text-[11px] text-ios-tertiary mt-3">
            Esta guía se muestra una sola vez, durante las primeras 24 horas desde tu primer ingreso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoleGuideOverlay;
