import { NavLink } from 'react-router-dom';
import { IconBox, IconChart, IconUsers, IconReturn, IconBell, IconTicket } from '../ui/icons';
import { useNotifications } from '../../context/NotificationContext';

const links = [
  { to: '/products', label: 'Productos', icon: IconBox, gradient: 'from-sky-500 to-blue-600' },
  { to: '/sales', label: 'Ventas', icon: IconChart, gradient: 'from-emerald-500 to-teal-600' },
  { to: '/tickets', label: 'Tickets', icon: IconTicket, gradient: 'from-amber-500 to-orange-600' },
  { to: '/suppliers', label: 'Proveedores', icon: IconUsers, gradient: 'from-indigo-500 to-purple-600' },
  { to: '/returns', label: 'Devoluciones', icon: IconReturn, gradient: 'from-orange-500 to-rose-600' },
  { to: '/notifications', label: 'Avisos', icon: IconBell, gradient: 'from-cyan-500 to-sky-600' },
];

const MobileNav = () => {
  const { pendingCount } = useNotifications();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-ios-surface/90 backdrop-blur-2xl border-t border-ios-separator/50 safe-bottom">
      <div className="grid grid-cols-6">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 pt-2 pb-1 text-[10px] font-semibold transition-all duration-200 ${
                isActive ? 'text-ios-tint' : 'text-ios-tertiary hover:text-ios-secondary'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative flex items-center justify-center w-[30px] h-[30px] rounded-[10px] transition-all duration-200">
                  <span
                    className={`absolute inset-0 rounded-[10px] transition-all duration-200 ${
                      isActive ? `bg-gradient-to-br ${link.gradient} shadow-[0_3px_8px_rgba(0,0,0,0.4)]` : ''
                    }`}
                  />
                  <link.icon
                    className={`relative w-5 h-5 transition-colors duration-200 ${
                      isActive ? 'text-white' : 'text-ios-tertiary'
                    }`}
                    strokeWidth={2}
                  />
                  {link.to === '/notifications' && pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-ios-tint text-white text-[10px] font-bold min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center leading-none shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </span>
                {link.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MobileNav;