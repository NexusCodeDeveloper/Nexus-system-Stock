import { useCallback, useEffect, useRef } from 'react';
import { LectorContext } from './lectorContexto';
import { crearDetectorEscaneo } from '../utils/lectorCodigos';

export const LectorProvider = ({ children }) => {
  const handlersRef = useRef([]);
  const detectorRef = useRef(null);
  if (detectorRef.current === null) detectorRef.current = crearDetectorEscaneo();

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
      const codigo = detectorRef.current.procesarTecla(event);
      if (!codigo) return;
      const handler = handlersRef.current[handlersRef.current.length - 1];
      if (!handler) return;
      if (!esCampoEditable(event.target)) event.preventDefault();
      handler.handlerRef.current?.(codigo);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return <LectorContext.Provider value={{ registrar }}>{children}</LectorContext.Provider>;
};


