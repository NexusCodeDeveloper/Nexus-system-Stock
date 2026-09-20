import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerPerfil } from '../api/autenticacion';
import { getItem, setItem, removeItem } from '../utils/storage';
import { useIosAlert } from '../components/alerts';

const AutenticacionContext = createContext();

export const useAutenticacion = () => useContext(AutenticacionContext);

export const AutenticacionProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useIosAlert();

  const usuarioRef = useRef(usuario);
  const avisoRef = useRef(0);

  useEffect(() => {
    usuarioRef.current = usuario;
  }, [usuario]);

  const clearSession = useCallback(() => {
    removeItem('token');
    setUsuario(null);
  }, []);

  useEffect(() => {
    const token = getItem('token');
    if (token) {
      obtenerPerfil()
        .then((res) => setUsuario(res.data))
        .catch((err) => {
          const status = err.response?.status;
          if (status === 401 || status === 404) {
            clearSession();
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      const habiaSesion = Boolean(usuarioRef.current);
      clearSession();
      if (!habiaSesion) return;
      const ahora = Date.now();
      if (ahora - avisoRef.current < 5000) return;
      avisoRef.current = ahora;
      toast({ message: 'Sesión expirada, iniciá sesión de nuevo', type: 'info', duration: 3200 });
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [clearSession, toast]);

  const login = useCallback((data) => {
    setItem('token', data.token);
    setUsuario(data);
    navigate('/', { replace: true });
  }, [navigate]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({ usuario, loading, login, logout }), [usuario, loading, login, logout]);

  return (
    <AutenticacionContext.Provider value={value}>
      {children}
    </AutenticacionContext.Provider>
  );
};
