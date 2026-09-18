import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../api/auth';
import { getItem, setItem, removeItem } from '../utils/storage';
import { useIosAlert } from '../components/alerts';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useIosAlert();

  const userRef = useRef(user);
  const avisoRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearSession = useCallback(() => {
    removeItem('token');
    setUser(null);
  }, []);

  useEffect(() => {
    const token = getItem('token');
    if (token) {
      getMe()
        .then((res) => setUser(res.data))
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
      const habiaSesion = Boolean(userRef.current);
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
    setUser(data);
    navigate('/', { replace: true });
  }, [navigate]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
