import { createContext, useCallback, useContext, useRef, useState } from 'react';
import IosAlert from './IosAlert';
import Toast from './Toast';

const AlertContext = createContext(null);

let toastTimer = 0;
let toastSeq = 0;

const AlertProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);
  const [toasts, setToasts] = useState([]);
  const queueRef = useRef([]);
  const seqRef = useRef(0);

  const active = queue[0] || null;

  const dismissAlert = useCallback((id) => {
    queueRef.current = queueRef.current.filter((a) => a.id !== id);
    setQueue(queueRef.current);
  }, []);

  const pushAlert = useCallback(
    (alert) => {
      const id = ++seqRef.current;
      queueRef.current = [...queueRef.current, { ...alert, id }];
      setQueue(queueRef.current);
      return () => dismissAlert(id);
    },
    [dismissAlert]
  );

  const toast = useCallback(({ message, type = 'success', duration = 2200 }) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const show = useCallback(
    (opts) =>
      new Promise((resolve) => {
        pushAlert({
          title: opts.title,
          message: opts.message,
          icon: opts.icon,
          content: opts.content,
          buttons: opts.buttons || [
            {
              text: opts.okText || 'OK',
              style: 'default',
              onPress: () => resolve(true),
            },
          ],
          onCloseFallback: () => resolve(false),
        });
      }),
    [pushAlert]
  );

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        const defaultText = opts.confirmText || 'Confirmar';
        pushAlert({
          title: opts.title,
          message: opts.message,
          icon: opts.icon,
          buttons: [
            {
              text: opts.cancelText || 'Cancelar',
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: defaultText,
              style: opts.destructive ? 'destructive' : 'default',
              onPress: () => resolve(true),
            },
          ],
        });
      }),
    [pushAlert]
  );

  const value = { show, confirm, toast, alert: show };

  return (
    <AlertContext.Provider value={value}>
      {children}

      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}

      {active && <IosAlert alert={active} onClose={() => resolveNone(active)} />}
    </AlertContext.Provider>
  );

  function resolveNone(alert) {
    if (alert.onCloseFallback) alert.onCloseFallback();
    dismissAlert(alert.id);
  }
};

export const useIosAlert = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useIosAlert debe usarse dentro de <AlertProvider>');
  return ctx;
};

export default AlertProvider;