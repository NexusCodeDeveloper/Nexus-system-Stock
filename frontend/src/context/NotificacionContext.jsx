import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotificacionContext } from './notificacionContexto';
import { obtenerNotificaciones, marcarVistasAdminApi } from '../api/notificaciones';
import { useAutenticacion } from './autenticacionContexto';
import { escucharPush } from '../services/GestorPush';

const POLL_MS = 30000;

export const NotificacionProvider = ({ children }) => {
  const { usuario } = useAutenticacion();
  const [pendientes, setPendientes] = useState([]);
  const [nuevasCompletadas, setNuevasCompletadas] = useState([]);
  const checkSeqRef = useRef(0);

  const check = useCallback(async () => {
    if (!usuario) {
      setPendientes([]);
      setNuevasCompletadas([]);
      return;
    }
    const seq = ++checkSeqRef.current;
    try {
      const res = await obtenerNotificaciones();
      if (seq !== checkSeqRef.current) return;
      const all = Array.isArray(res.data) ? res.data : [];
      setPendientes(all.filter((n) => n.estado === 'pendiente'));
      if (usuario.rol === 'admin') {
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
  }, [usuario]);

  const marcarVistasAdmin = useCallback(async () => {
    try {
      await marcarVistasAdminApi();
    } catch {
      /* silencioso */
    }
    check();
  }, [check]);

  useEffect(() => {
    if (!usuario) return;
    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check, usuario]);

  useEffect(() => {
    if (!usuario) return;
    const off = escucharPush(() => check());
    return off;
  }, [check, usuario]);

  const value = useMemo(
    () => ({
      pendientes,
      pendingCount: pendientes.length,
      refresh: check,
      nuevasCompletadas,
      marcarVistasAdmin,
    }),
    [pendientes, check, nuevasCompletadas, marcarVistasAdmin]
  );

  return (
    <NotificacionContext.Provider value={value}>
      {children}
    </NotificacionContext.Provider>
  );
};

