import { createContext, useContext } from 'react';

export const NotificacionContext = createContext(null);

export const useNotificaciones = () => {
  const ctx = useContext(NotificacionContext);
  if (!ctx) throw new Error('useNotificaciones debe usarse dentro de <NotificacionProvider>');
  return ctx;
};
