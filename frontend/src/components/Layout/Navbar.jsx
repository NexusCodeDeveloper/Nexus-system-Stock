import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { IconLogout, IconChevronDown, IconSun, IconMoon } from '../ui/icons';
import IosToggle from '../ui/IosToggle';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="bg-ios-surface/60 backdrop-blur-2xl border-b border-ios-separator/40 px-4 sm:px-6 py-2.5 flex items-center justify-between z-10 shrink-0">
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-ios-pill transition-colors hover:bg-ios-hover/5" title="Cambiar entre modo noche y modo día">
          <IconSun className={`w-4 h-4 transition-colors ${theme === 'light' ? 'text-ios-orange' : 'text-ios-tertiary'}`} strokeWidth={1.9} />
          <IosToggle checked={theme === 'light'} onChange={toggleTheme} />
          <IconMoon className={`w-4 h-4 transition-colors ${theme === 'dark' ? 'text-ios-tint' : 'text-ios-tertiary'}`} strokeWidth={1.9} />
        </div>
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-ios-pill transition-all hover:bg-ios-hover/5 active:bg-ios-hover/10"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ios-tint to-blue-600 flex items-center justify-center text-sm font-bold text-white shadow-[0_3px_10px_rgba(10,132,255,0.4)] ring-2 ring-white/10">
                {user.nombre?.charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-[14px] font-semibold text-ios-label leading-tight">{user.nombre}</p>

              </div>
              <IconChevronDown className={`w-3.5 h-3.5 text-ios-tertiary transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-ios-surface/95 backdrop-blur-2xl border border-ios-separator/40 rounded-2xl shadow-ios-alert overflow-hidden p-1.5 animate-ios-modal">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-ios-tertiary uppercase tracking-wide font-medium">Conectado como</p>
                    <p className="text-[13px] font-semibold text-ios-label mt-0.5 truncate">{user.email}</p>
                  </div>
                  <div className="h-px bg-ios-separator/40 my-1" />
                  <button
                    onClick={logout}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[15px] text-ios-red rounded-xl hover:bg-ios-red/10 transition-colors font-medium"
                  >
                    <IconLogout className="w-[18px] h-[18px]" strokeWidth={1.8} />
                    Cerrar Sesión
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;