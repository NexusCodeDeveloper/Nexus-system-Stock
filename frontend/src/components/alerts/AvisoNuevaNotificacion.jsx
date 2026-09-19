import { useAutenticacion } from '../../context/AutenticacionContext';
import { useNotificaciones } from '../../context/NotificacionContext';
import { IconBell, IconCheck, IconX } from '../ui/icons';

const AvisoNuevaNotificacion = () => {
  const { usuario } = useAutenticacion();
  const { pendientes, nuevasCompletadas, marcarVistasAdmin } = useNotificaciones();
  const isAdmin = usuario?.rol === 'admin';

  if (pendientes.length === 0 && nuevasCompletadas.length === 0) return null;

  return (
    <>
      {nuevasCompletadas.length > 0 && isAdmin && (
        <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[70] w-[320px] max-w-[calc(100vw-2rem)] bg-ios-surface border border-ios-green/40 rounded-ios-alert shadow-ios-alert p-3.5 animate-ios-toast">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-full bg-ios-green/15 text-ios-green flex items-center justify-center shrink-0">
              <IconCheck className="w-4 h-4" strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ios-label leading-snug">
                {nuevasCompletadas.length === 1
                  ? 'Tarea realizada'
                  : `${nuevasCompletadas.length} tareas realizadas`}
              </p>
              <div className="mt-1 space-y-1">
                {nuevasCompletadas.slice(0, 3).map((nc) => (
                  <p key={nc.id} className="text-[12px] text-ios-secondary leading-snug">
                    <span className="text-ios-green font-semibold">"{nc.titulo}"</span>
                    {nc.realizadoNombre ? ` · ${nc.realizadoNombre}` : ''}
                  </p>
                ))}
                {nuevasCompletadas.length > 3 && (
                  <p className="text-[11px] text-ios-tertiary">
                    +{nuevasCompletadas.length - 3} más
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={marcarVistasAdmin}
              className="pointer-events-auto shrink-0 text-ios-tertiary hover:text-ios-label transition-colors p-0.5 -m-0.5"
            >
              <IconX className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div
          className={`fixed right-4 z-[70] max-w-[320px] bg-ios-surface border border-ios-separator/40 rounded-ios-alert shadow-ios-alert p-3.5 flex items-start gap-3 pointer-events-none ${
            nuevasCompletadas.length > 0 && isAdmin ? 'bottom-44 md:bottom-24' : 'bottom-24 md:bottom-6'
          }`}
        >
          <span className="w-9 h-9 rounded-full bg-ios-orange/15 text-ios-orange flex items-center justify-center shrink-0">
            <IconBell className="w-4 h-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[13px] font-semibold text-ios-label leading-snug">
              {pendientes.length === 1
                ? 'NOTIFICACIÓN PENDIENTE'
                : `${pendientes.length} avisos pendientes`}
            </p>
            <p className="text-[12px] text-ios-secondary mt-0.5 leading-snug">
              Revisá la sección de avisos
            </p>
          </div>
          <span className="ml-auto shrink-0 mt-0.5 text-ios-green">
            <IconCheck className="w-4 h-4" strokeWidth={2.5} />
          </span>
        </div>
      )}
    </>
  );
};

export default AvisoNuevaNotificacion;