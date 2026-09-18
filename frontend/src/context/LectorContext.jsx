import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

const LectorContext = createContext(null);

const MIN_LARGO = 6;
const MAX_LARGO = 128;
const MAX_INTERVALO_MS = 50;
const MAX_INTERVALO_MAQUINA_MS = 35;

export const LectorProvider = ({ children }) => {
  const handlersRef = useRef([]);
  const bufferRef = useRef('');
  const ultimaTeclaRef = useRef(0);
  const lentoRef = useRef(false);

  const registrar = useCallback((handlerRef) => {
    const entrada = { handlerRef };
    handlersRef.current = [...handlersRef.current, entrada];
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== entrada);
    };
  }, []);

  useEffect(() => {
    const esCampoEditable = (el) => {
      if (!el || typeof el.tagName !== 'string') return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
    };

    const onKeyDown = (event) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;

      const ahora = Date.now();
      const delta = ahora - ultimaTeclaRef.current;
      ultimaTeclaRef.current = ahora;

      if (event.key === 'Enter') {
        const codigo = bufferRef.current;
        const esMaquina = !lentoRef.current;
        bufferRef.current = '';
        lentoRef.current = false;
        const handler = handlersRef.current[handlersRef.current.length - 1];
        if (esMaquina && codigo.length >= MIN_LARGO && handler) {
          if (!esCampoEditable(event.target)) event.preventDefault();
          handler.handlerRef.current?.(codigo);
        }
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Tab' || event.key === 'Escape') {
        bufferRef.current = '';
        lentoRef.current = false;
        return;
      }

      if (event.key.length !== 1) return;

      if (delta > MAX_INTERVALO_MS) {
        bufferRef.current = '';
        lentoRef.current = false;
      } else if (delta > MAX_INTERVALO_MAQUINA_MS) {
        lentoRef.current = true;
      }
      bufferRef.current += event.key;
      if (bufferRef.current.length > MAX_LARGO) {
        bufferRef.current = bufferRef.current.slice(-MAX_LARGO);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return <LectorContext.Provider value={{ registrar }}>{children}</LectorContext.Provider>;
};

export const useLector = (handler, activo = true) => {
  const ctx = useContext(LectorContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx || !activo) return undefined;
    return ctx.registrar(handlerRef);
  }, [ctx, activo]);
};
