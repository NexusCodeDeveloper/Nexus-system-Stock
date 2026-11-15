import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { useIsMobile } from '../../hooks/use-mobile';
import { cn } from '../../lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet';
import { IconPanelLeft } from './icons';
import { SidebarContext, useSidebar } from './sidebarContexto';

const SIDEBAR_WIDTH = '16.25rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '4.5rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

export const SidebarProvider = forwardRef(
  ({ defaultOpen = false, className, style, children, ...props }, ref) => {
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(defaultOpen);
    const [openMobile, setOpenMobile] = useState(false);

    const toggleSidebar = useCallback(() => {
      if (isMobile) {
        setOpenMobile((value) => !value);
      } else {
        setOpen((value) => !value);
      }
    }, [isMobile]);

    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleSidebar]);

    const state = open ? 'expanded' : 'collapsed';

    const contextValue = useMemo(
      () => ({ state, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
      [state, isMobile, openMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          ref={ref}
          style={{
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style,
          }}
          className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = 'SidebarProvider';

export const Sidebar = forwardRef(
  ({ hoverExpand = false, className, style, children, ...props }, ref) => {
    const { isMobile, state, setOpen, openMobile, setOpenMobile } = useSidebar();

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            side="left"
            data-sidebar="sidebar"
            data-mobile="true"
            className={cn(
              'w-[var(--sidebar-width)] border-r-0 bg-ios-surface bg-gradient-to-b from-ios-surface2 to-ios-surface p-0 text-ios-label shadow-[8px_0_28px_rgba(0,0,0,0.28)]',
              className
            )}
            style={{ '--sidebar-width': SIDEBAR_WIDTH_MOBILE, backgroundColor: 'rgb(var(--ios-surface))' }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menú</SheetTitle>
              <SheetDescription>Navegación principal del sistema.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer hidden shrink-0 text-ios-label md:block"
        data-state={state}
        data-collapsible={state === 'collapsed' ? 'icon' : ''}
        data-side="left"
      >
        <div
          className={cn(
            'relative bg-transparent',
            hoverExpand
              ? 'w-[var(--sidebar-width-icon)]'
              : 'w-[var(--sidebar-width)] transition-[width] duration-300 ease-out group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]'
          )}
        />
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden h-dvh w-[var(--sidebar-width)] overflow-hidden border-r border-ios-separator/50 bg-ios-surface bg-gradient-to-b from-ios-surface2 to-ios-surface shadow-[8px_0_28px_rgba(0,0,0,0.28)] transition-[width] duration-300 ease-out group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] md:flex',
            className
          )}
          onMouseEnter={hoverExpand ? () => setOpen(true) : undefined}
          onMouseLeave={hoverExpand ? () => setOpen(false) : undefined}
          style={{ backgroundColor: 'rgb(var(--ios-surface))', ...style }}
          {...props}
        >
          <div data-sidebar="sidebar" className="flex h-full w-full flex-col">
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = 'Sidebar';

export const SidebarTrigger = forwardRef(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      ref={ref}
      type="button"
      data-sidebar="trigger"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground outline-none ring-ios-tint/30 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <IconPanelLeft />
      <span className="sr-only">Alternar menú</span>
    </button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

export const SidebarHeader = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar="header" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
));
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarFooter = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar="footer" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
));
SidebarFooter.displayName = 'SidebarFooter';

export const SidebarContent = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="content"
    className={cn(
      'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
      className
    )}
    {...props}
  />
));
SidebarContent.displayName = 'SidebarContent';

export const SidebarGroup = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group"
    className={cn('relative flex w-full min-w-0 flex-col p-3', className)}
    {...props}
  />
));
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-label"
    className={cn(
      'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-ios-tertiary outline-none ring-ios-tint/30 transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
      'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
      className
    )}
    {...props}
  />
));
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarGroupContent = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar="group-content" className={cn('w-full text-sm', className)} {...props} />
));
SidebarGroupContent.displayName = 'SidebarGroupContent';

export const SidebarMenu = forwardRef(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
    {...props}
  />
));
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = forwardRef(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn('group/menu-item relative', className)}
    {...props}
  />
));
SidebarMenuItem.displayName = 'SidebarMenuItem';

export const SidebarMenuButton = forwardRef(
  ({ asChild = false, isActive = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(
          'peer/menu-button flex h-[52px] w-full items-center gap-4 overflow-hidden rounded-2xl px-2 py-2.5 text-left text-sm text-ios-secondary outline-none ring-ios-tint/30 transition-[width,height,padding] hover:bg-ios-hover/[0.05] hover:text-ios-label focus-visible:ring-2 active:bg-ios-hover/[0.09] active:text-ios-label disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-ios-tint/15 data-[active=true]:font-semibold data-[active=true]:text-ios-label data-[active=true]:ring-1 data-[active=true]:ring-ios-tint/30 data-[active=true]:shadow-[0_8px_18px_-10px_rgba(10,132,255,0.5)] data-[active=true]:hover:bg-ios-tint/15 data-[active=true]:active:bg-ios-tint/15 group-data-[collapsible=icon]:justify-center [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
          className
        )}
        {...props}
      />
    );
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';


