import { createContext, useContext } from 'react';

export const CarritoContext = createContext(null);

export const claveItemCarrito = (item) =>
  `${item?.producto || ''}|${item?.talle || ''}|${item?.color || ''}`;

export const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo', activeCls: 'btn-vivo btn-vivo-verde font-semibold' },
  { key: 'transferencia', label: 'Transferencia', activeCls: 'btn-vivo btn-vivo-azul font-semibold' },
  { key: 'tarjeta', label: 'Tarjeta', activeCls: 'btn-vivo btn-vivo-violeta font-semibold' },
  { key: 'cuentaCorriente', label: 'Cta. Cte.', activeCls: 'btn-vivo btn-vivo-naranja font-semibold' },
];

export const useCarrito = () => {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
};
