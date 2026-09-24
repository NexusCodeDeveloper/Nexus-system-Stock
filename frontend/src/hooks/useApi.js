import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerMensajeErrorApi } from '../utils/apiError';

export const useApi = (fetcher, { deps = [], auto = true, initialData = null, mensajeError = 'Error al cargar los datos' } = {}) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(auto);
  const [error, setError] = useState('');
  const seqRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mensajeRef = useRef(mensajeError);
  mensajeRef.current = mensajeError;

  const run = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    try {
      const resultado = await fetcherRef.current();
      if (seq !== seqRef.current) return null;
      setData(resultado);
      return resultado;
    } catch (err) {
      if (seq !== seqRef.current) return null;
      setError(obtenerMensajeErrorApi(err, mensajeRef.current));
      return null;
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auto) return undefined;
    run();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loading, error, setError, setLoading, run };
};
