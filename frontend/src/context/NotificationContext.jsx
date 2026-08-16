import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getNotifications, markVistasAdmin as apiMarkVistasAdmin } from '../api/notifications';
import { useAuth } from './AuthContext';

const POLL_MS = 30000;
const MAX_COMPLETADAS = 3;

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [pendientes, setPendientes] = useState([]);
  const [nuevasCompletadas, setNuevasCompletadas] = useState([]);

  const check = useCallback(async () => {
    if (!user) {
      setPendientes([]);
      setNuevasCompletadas([]);
      return;
    }
    try {
      const res = await getNotifications();
      const all = res.data;
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
            .slice(0, MAX_COMPLETADAS)
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
    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check]);

  return (
    <NotificationContext.Provider
      value={{
        pendientes,
        pendingCount: pendientes.length,
        refresh: check,
        nuevasCompletadas,
        markVistasAdmin,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de <NotificationProvider>');
  return ctx;
};