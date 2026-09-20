import { NavLink } from 'react-router-dom';
import { IconBox, IconChart, IconUsers, IconUserPlus, IconReturn, IconBell, IconTile, IconTicket, IconWarehouse } from '../ui/icons';
import { useNotificaciones } from '../../context/NotificacionContext';
import { useAutenticacion } from '../../context/AutenticacionContext';

const links = [
  { to: '/productos', label: 'Salón', icon: IconBox, gradient: 'from-sky-500 to-blue-600' },
  { to: '/deposito', label: 'Depósito', icon: IconWarehouse, gradient: 'from-violet-500 to-purple-600' },
  { to: '/ventas', label: 'Ventas', icon: IconChart, gradient: 'from-emerald-500 to-teal-600' },
  { to: '/tickets', label: 'Tickets', icon: IconTicket, gradient: 'from-amber-500 to-orange-600' },
  { to: '/proveedores', label: 'Proveedores', icon: IconUsers, gradient: 'from-indigo-500 to-purple-600', adminOnly: true },
  { to: '/devoluciones', label: 'Devoluciones', icon: IconReturn, gradient: 'from-orange-500 to-rose-600' },
  { to: '/notificaciones', label: 'Avisos', icon: IconBell, gradient: 'from-cyan-500 to-sky-600' },
  { to: '/empleados', label: 'Empleados', icon: IconUserPlus, gradient: 'from-rose-500 to-pink-600', adminOnly: true },
];

const Sidebar = () => {
  const { pendingCount } = useNotificaciones();
  const { esAdmin } = useAutenticacion();
  const visibleLinks = links.filter((link) => !link.adminOnly || esAdmin);

  return (
    <aside className="group absolute inset-y-0 left-0 z-30 w-[72px] hover:w-[260px] transition-[width] duration-300 ease-out overflow-hidden bg-ios-surface/95 backdrop-blur-2xl border-r border-ios-separator/40 flex flex-col shadow-[8px_0_28px_rgba(0,0,0,0.28)]">
      <div className="px-4 pt-7 pb-6">
        <div className="relative flex items-center">
          <div className="w-10 h-10 shrink-0 rounded-[11px] bg-gradient-to-br from-ios-tint to-blue-600 flex items-center justify-center shadow-[0_4px_14px_rgba(10,132,255,0.4)]">
            <span className="text-white font-bold text-[15px] tracking-tight">NC</span>
          </div>
          <div className="pointer-events-none absolute left-[56px] top-1/2 -translate-y-1/2 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <h1 className="text-[17px] font-bold text-ios-label tracking-tight">NexusCode</h1>
            <p className="text-[11px] text-ios-tertiary font-medium">Sistema de stock</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `relative flex items-center pl-2 pr-3 py-2.5 rounded-2xl transition-colors duration-200 ${
                isActive
                  ? 'bg-ios-hover/[0.08]'
                  : 'hover:bg-ios-hover/[0.05] active:bg-ios-hover/[0.09]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative shrink-0">
                  <IconTile
                    gradient={link.gradient}
                    className={`w-8 h-8 transition-opacity duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'
                    }`}
                  >
                    <link.icon className="w-4 h-4 text-white" strokeWidth={2.1} />
                  </IconTile>
                  {link.to === '/notificaciones' && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-ios-tint text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </span>
                <span
                  className={`pointer-events-none absolute left-[56px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[15px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                    isActive
                      ? 'text-ios-label font-semibold'
                      : 'text-ios-secondary group-hover:text-ios-label'
                  }`}
                >
                  {link.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="[perspective:700px]">
          <div className="relative h-11 animate-ios-flip bg-ios-surface2 border border-ios-separator/40 rounded-2xl px-4 py-3 text-center shadow-ios-card">
            <div className="ios-flip-face absolute inset-0 flex items-center justify-center">
              <p className="text-[13px] text-ios-secondary font-semibold whitespace-nowrap">
                Desarrollo by <span className="text-ios-label font-bold">NexusCode</span>
              </p>
            </div>
            <div className="ios-flip-face absolute inset-0 flex items-center justify-center [transform:rotateY(180deg)]">
              <p className="text-[13px] text-ios-secondary font-semibold whitespace-nowrap">
                Desarrollo by <span className="text-ios-label font-bold">NexusCode</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
