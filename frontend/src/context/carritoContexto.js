import { createContext, useContext } from 'react';

export const CarritoContext = createContext(null);

export const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo', activeCls: 'bg-ios-green/15 text-ios-green border-ios-green/30' },
  { key: 'transferencia', label: 'Transferencia', activeCls: 'bg-ios-tint/15 text-ios-tint border-ios-tint/30' },
  { key: 'tarjeta', label: 'Tarjeta', activeCls: 'bg-ios-purple/15 text-ios-purple border-ios-purple/30' },
];

export const useCarrito = () => {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
};
