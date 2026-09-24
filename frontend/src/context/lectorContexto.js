import { createContext, useContext, useEffect, useRef } from 'react';

export const LectorContext = createContext(null);

export const useLector = (handler, activo = true) => {
  const ctx = useContext(LectorContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx || !activo) return undefined;
    return ctx.registrar(handlerRef);
  }, [ctx, activo]);
};
