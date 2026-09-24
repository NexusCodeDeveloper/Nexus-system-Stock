import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AutenticacionContext } from './autenticacionContexto';
import { useNavigate } from 'react-router-dom';
import { obtenerPerfil, cerrarSesion } from '../api/autenticacion';
import { getItem, setItem, removeItem } from '../utils/storage';
import { desactivarPush, sincronizarPush } from '../services/GestorPush';
import { useIosAlert } from '../components/alerts';

export const AutenticacionProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast, show } = useIosAlert();

  const usuarioRef = useRef(null);
  const avisoRef = useRef(0);

  const clearSession = useCallback(() => {
    removeItem('token');
    setUsuario(null);
  }, []);

  useEffect(() => {
    usuarioRef.current = usuario;
  }, [usuario]);

  useEffect(() => {
    const handleUnauthorized = (evento) => {
      const habiaSesion = Boolean(usuarioRef.current);
      const desactivada = Boolean(evento?.detail?.desactivada);
      clearSession();
      if (!habiaSesion) return;
      const ahora = Date.now();
      if (ahora - avisoRef.current < 5000) return;
      avisoRef.current = ahora;
      toast({ message: 'Sesión expirada, iniciá sesión de nuevo', type: 'info', duration: 3200 });
      if (desactivada) {
        show({
          icon: 'error',
          title: 'Acceso denegado',
          message: 'Un administrador te negó el acceso al sistema',
        });
      }
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [clearSession, toast, show]);

  useEffect(() => {
    let cancelado = false;
    const cargarPerfil = async () => {
      const token = getItem('token');
      if (!token) {
        if (!cancelado) setLoading(false);
        return;
      }
      for (let intento = 0; intento < 2; intento += 1) {
        try {
          const res = await obtenerPerfil();
          if (cancelado) return;
          setUsuario(res.data);
          setLoading(false);
          return;
        } catch (err) {
          const status = err.response?.status;
          if (status === 401 || status === 404) {
            clearSession();
            if (!cancelado) setLoading(false);
            return;
          }
          if (intento === 0) {
            if (!cancelado) {
              toast({ message: 'No se pudo conectar con el servidor. Reintentando…', type: 'info', duration: 2500 });
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } else if (!cancelado) {
            toast({
              message: 'No se pudo conectar con el servidor. Revisá que el backend esté corriendo.',
              type: 'error',
              duration: 4500,
            });
            setLoading(false);
          }
        }
      }
    };
    cargarPerfil();
    return () => {
      cancelado = true;
    };
  }, [clearSession, toast]);

  const login = useCallback(
    (data) => {
      setItem('token', data.token);
      setUsuario(data);
      navigate('/', { replace: true });
      void sincronizarPush();
    },
    [navigate]
  );

  const logout = useCallback(() => {
    const token = getItem('token');
    clearSession();
    if (token) {
      void cerrarSesion(token).catch(() => {});
      void desactivarPush(token);
    }
  }, [clearSession]);

  const esAdmin = usuario?.rol === 'admin';

  const value = useMemo(
    () => ({ usuario, loading, login, logout, esAdmin }),
    [usuario, loading, login, logout, esAdmin]
  );

  return (
    <AutenticacionContext.Provider value={value}>
      {children}
    </AutenticacionContext.Provider>
  );
};
