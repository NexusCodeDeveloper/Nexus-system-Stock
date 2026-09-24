import { createContext, useContext } from 'react';

export const CajaContext = createContext(null);

export const useCaja = () => {
  const ctx = useContext(CajaContext);
  if (!ctx) throw new Error('useCaja debe usarse dentro de <CajaProvider>');
  return ctx;
};
