const Icon = ({ d, className = 'w-5 h-5', strokeWidth = 1.8 }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const IconMagnifyingGlass = (p) => <Icon {...p} d="M21 21l-4.35-4.35m1.35-5.15a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />;
export const IconChevronRight = (p) => <Icon {...p} d="M9 5l7 7-7 7" />;
export const IconChevronDown = (p) => <Icon {...p} d="M19 9l-7 7-7-7" />;
export const IconPlus = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;
export const IconX = (p) => <Icon {...p} d="M6 6l12 12M18 6L6 18" />;
export const IconTrash = (p) => <Icon {...p} d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />;
export const IconPencil = (p) => <Icon {...p} d="M16.86 4.49a2.12 2.12 0 013 3l-9.66 9.66L6 18l.85-4.2 9.61-9.31z" />;
export const IconCart = (p) => <Icon {...p} d="M3 3h2l2.68 13.39a2 2 0 002 1.61h7.72a2 2 0 002-1.61L21 8H6m9 11a1 1 0 100 2 1 1 0 000-2zm-7 0a1 1 0 100 2 1 1 0 000-2z" />;
export const IconEye = (p) => <Icon {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6z" />;
export const IconEyeOff = (p) => <Icon {...p} d="M3 3l18 18M10.6 10.7a3 3 0 003.7 3.7M9.9 5.2A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a17.4 17.4 0 01-2.3 3.3M6.6 6.6A17.2 17.2 0 002 12s3.5 7 10 7c1.7 0 3.3-.4 4.6-1.1" />;
export const IconBox = (p) => <Icon {...p} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />;
export const IconChart = (p) => <Icon {...p} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
export const IconUsers = (p) => <Icon {...p} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />;
export const IconReturn = (p) => <Icon {...p} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />;
export const IconLogout = (p) => <Icon {...p} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />;
export const IconMail = (p) => <Icon {...p} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />;
export const IconCheck = (p) => <Icon {...p} d="M5 13l4 4L19 7" />;
export const IconRefresh = (p) => <Icon {...p} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />;
export const IconList = (p) => <Icon {...p} d="M4 6h16M4 12h16M4 18h16" />;
export const IconHistory = (p) => <Icon {...p} d="M3 3v5h5M3.05 13A9 9 0 106 5.3L3 8m0-5h5" />;
export const IconClock = (p) => <Icon {...p} d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
export const IconPhone = (p) => <Icon {...p} d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />;
export const IconMenu = (p) => <Icon {...p} d="M4 7h16M4 12h16M4 17h16" />;
export const IconArrowUp = (p) => <Icon {...p} d="M7 14l5-5 5 5" />;
export const IconPerson = (p) => <Icon {...p} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />;
export const IconMinus = (p) => <Icon {...p} d="M5 12h14" />;
export const IconSun = (p) => <Icon {...p} d="M12 17a5 5 0 100-10 5 5 0 000 10zm0-15v2m0 16v2M3.34 3.34l1.41 1.41m14.84 14.84l1.41 1.41M1 12h2m18 0h2M3.34 20.66l1.41-1.41M19.25 4.75l1.41-1.41" />;
export const IconMoon = (p) => <Icon {...p} d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />;
export const IconCash = (p) => <Icon {...p} d="M4 7h16a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zm2 1a1 1 0 00-1 1 1 1 0 001 1 1 1 0 001-1 1 1 0 00-1-1zm8 3a2 2 0 11-4 0 2 2 0 014 0zm6 2a1 1 0 00-2 0 1 1 0 002 0z" />;
export const IconBank = (p) => <Icon {...p} d="M3 21h18M4 21V10m4 11V10m4 11V10m4 11V10m5-4L12 2 3 10z" />;
export const IconCard = (p) => <Icon {...p} d="M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm-1 5h20M6 16h4" />;
export const IconLock = (p) => <Icon {...p} d="M12 15v3m-6-9h12v11a1 1 0 01-1 1H7a1 1 0 01-1-1V9zm2 0V7a4 4 0 118 0v2" />;
export const IconBell = (p) => <Icon {...p} d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />;
export const IconTicket = (p) => <Icon {...p} d="M4 6a1 1 0 011-1h14a1 1 0 011 1v3a2 2 0 000 6v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3a2 2 0 000-6V6zm4 3h8M8 12h8M8 15h4" />;
export const IconPrint = (p) => <Icon {...p} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />;

export const IconTile = ({ children, gradient = 'from-sky-500 to-blue-600', className = 'w-7 h-7' }) => (
  <span
    className={`flex items-center justify-center rounded-[9px] bg-gradient-to-br ${gradient} shadow-[0_3px_10px_rgba(0,0,0,0.4)] shrink-0 ${className}`}
  >
    {children}
  </span>
);

export default Icon;