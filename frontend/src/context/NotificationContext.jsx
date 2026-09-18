import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getNotifications, markVistasAdmin as apiMarkVistasAdmin } from '../api/notifications';
import { useAuth } from './AuthContext';
import { escucharPush } from '../services/pushManager';

const POLL_MS = 30000;

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [pendientes, setPendientes] = useState([]);
  const [nuevasCompletadas, setNuevasCompletadas] = useState([]);
  const checkSeqRef = useRef(0);

  const check = useCallback(async () => {
    if (!user) {
      setPendientes([]);
      setNuevasCompletadas([]);
      return;
    }
    const seq = ++checkSeqRef.current;
    try {
      const res = await getNotifications();
      if (seq !== checkSeqRef.current) return;
      const all = Array.isArray(res.data) ? res.data : [];
      setPendientes(all.filter((n) => n.estado === 'pendiente'));
      if (user.rol === 'admin') {
        setNuevasCompletadas(
          all
            .filter((n) => n.nuevaParaAdmin)
            .map((n) => ({
              id: n._id,
              titulo: n.titulo,
              realizadoNombre: n.realizadoNombre || n.realizadoPor?.nombre || '',
            }))
        );
      } else {
        setNuevasCompletadas([]);
      }
    } catch {
      /* silencioso: si falla la consulta, no interrumpimos */
    }
  }, [user]);

  const markVistasAdmin = useCallback(async () => {
    try {
      await apiMarkVistasAdmin();
    } catch {
      /* silencioso */
    }
    check();
  }, [check]);

  useEffect(() => {
    if (!user) return;
    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check, user]);

  useEffect(() => {
    if (!user) return;
    const off = escucharPush(() => check());
    return off;
  }, [check, user]);

  const value = useMemo(
    () => ({
      pendientes,
      pendingCount: pendientes.length,
      refresh: check,
      nuevasCompletadas,
      markVistasAdmin,
    }),
    [pendientes, check, nuevasCompletadas, markVistasAdmin]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de <NotificationProvider>');
  return ctx;
};