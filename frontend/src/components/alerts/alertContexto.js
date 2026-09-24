import { createContext, useContext } from 'react';

export const AlertContext = createContext(null);

export const useIosAlert = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useIosAlert debe usarse dentro de <AlertProvider>');
  return ctx;
};
