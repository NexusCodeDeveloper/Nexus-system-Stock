import { NavLink, useLocation } from 'react-router-dom';
import { IconBox, IconChart, IconUsers, IconUserPlus, IconReturn, IconBell, IconTile, IconTicket, IconWallet, IconWarehouse, IconArchive } from '../ui/icons';
import { useNotificaciones } from '../../context/notificacionContexto';
import { useSolicitudesCliente } from '../../context/solicitudContexto';
import { useAutenticacion } from '../../context/autenticacionContexto';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar';
import { useSidebar } from '../ui/sidebarContexto';

const links = [
  { to: '/productos', label: 'Salón', icon: IconBox, gradient: 'from-sky-500 to-blue-600' },
  { to: '/deposito', label: 'Depósito', icon: IconWarehouse, gradient: 'from-violet-500 to-purple-600' },
  { to: '/ventas', label: 'Ventas', icon: IconChart, gradient: 'from-emerald-500 to-teal-600' },
  { to: '/tickets', label: 'Tickets', icon: IconTicket, gradient: 'from-amber-500 to-orange-600' },
  { to: '/clientes', label: 'Clientes', icon: IconWallet, gradient: 'from-lime-500 to-emerald-600' },
  { to: '/proveedores', label: 'Proveedores', icon: IconUsers, gradient: 'from-indigo-500 to-purple-600', adminOnly: true },
  { to: '/devoluciones', label: 'Devoluciones', icon: IconReturn, gradient: 'from-orange-500 to-rose-600' },
  { to: '/notificaciones', label: 'Avisos', icon: IconBell, gradient: 'from-cyan-500 to-sky-600' },
  { to: '/empleados', label: 'Empleados', icon: IconUserPlus, gradient: 'from-rose-500 to-pink-600', adminOnly: true },
  { to: '/papelera', label: 'Papelera', icon: IconArchive, gradient: 'from-slate-500 to-gray-600', adminOnly: true },
];

const Sidebar = () => {
  const { pendingCount } = useNotificaciones();
  const { pendientesCount } = useSolicitudesCliente();
  const { esAdmin } = useAutenticacion();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const visibleLinks = links.filter((link) => !link.adminOnly || esAdmin);

  const contadorDe = (to) => {
    if (to === '/notificaciones') return pendingCount;
    if (to === '/clientes') return esAdmin ? pendientesCount : 0;
    return 0;
  };

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarRoot hoverExpand>
      <SidebarHeader className="px-4 pb-6 pt-7">
        <div className="flex items-center gap-4 overflow-hidden">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-ios-tint bg-gradient-to-br from-ios-tint to-blue-600 shadow-[0_4px_14px_rgba(10,132,255,0.4)]">
            <span className="text-[15px] font-bold tracking-tight text-white">NC</span>
          </div>
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[17px] font-bold tracking-tight text-ios-label">NexusCode</span>
            <span className="truncate text-[11px] font-medium text-ios-tertiary">Sistema de stock</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menú</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleLinks.map((link) => {
                const isActive = pathname === link.to;
                const contador = contadorDe(link.to);

                return (
                  <SidebarMenuItem key={link.to}>
                    <SidebarMenuButton asChild isActive={isActive} title={link.label}>
                      <NavLink to={link.to} onClick={handleNavigate}>
                        <span className="relative shrink-0">
                          <IconTile
                            gradient={link.gradient}
                            className={`size-8 transition-opacity duration-200 ${
                              isActive ? 'opacity-100' : 'opacity-100 md:opacity-60 md:group-hover:opacity-90 md:group-data-[state=expanded]:opacity-90'
                            }`}
                          >
                            <link.icon className="size-4 text-white" strokeWidth={2.1} />
                          </IconTile>
                          {contador > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ios-tint px-1 text-[10px] font-bold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
                              {contador > 99 ? '99+' : contador}
                            </span>
                          )}
                        </span>
                        <span className="group-data-[collapsible=icon]:hidden">{link.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 group-data-[collapsible=icon]:hidden">
        <div className="flex h-11 items-center justify-center rounded-2xl border border-ios-separator/40 bg-ios-surface2 px-4 py-3 text-center shadow-ios-card">
          <p className="whitespace-nowrap text-[13px] font-semibold text-ios-secondary">
            Desarrollo by <span className="font-bold text-ios-label">NexusCode</span>
          </p>
        </div>
      </SidebarFooter>
    </SidebarRoot>
  );
};

export default Sidebar;
