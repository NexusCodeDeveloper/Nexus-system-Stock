import { getItem } from './storage';
import { API_BASE_URL } from './apiBase';

const REPORTAR = import.meta.env.VITE_ERROR_REPORTING !== 'false';
const VENTANA_DEDUPE_MS = 10000;
const MAX_POR_SESION = 20;

let enviados = 0;
const ultimos = new Map();

const usuarioActual = () => {
  try {
    const token = getItem('token');
    if (!token) return null;
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.email || payload.nombre || null;
  } catch {
    return null;
  }
};

export const reportarError = (error, contexto = {}) => {
  if (!REPORTAR || typeof window === 'undefined') return;

  const mensaje = String(error?.message || error || 'Error desconocido');
  const stack = error?.stack || '';
  const firma = `${mensaje}|${contexto.lugar || ''}|${contexto.componente || ''}`;
  const ahora = Date.now();

  if (ahora - (ultimos.get(firma) || 0) < VENTANA_DEDUPE_MS) return;
  ultimos.set(firma, ahora);
  if (ultimos.size > 100) {
    const primera = ultimos.keys().next().value;
    ultimos.delete(primera);
  }
  if (enviados >= MAX_POR_SESION) return;
  enviados++;

  if (import.meta.env.DEV) {
    console.error('[Error del navegador]', mensaje, contexto, error);
  }

  const payload = {
    mensaje: mensaje.slice(0, 1000),
    stack: stack.slice(0, 4000),
    lugar: String(contexto.lugar || '').slice(0, 500),
    componente: String(contexto.componente || '').slice(0, 500),
    ruta: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    userAgent: (navigator.userAgent || '').slice(0, 500),
    contexto: {
      estado: contexto.status || null,
      usuario: usuarioActual(),
      version: import.meta.env.MODE,
    },
  };

  try {
    const url = `${API_BASE_URL}/errores`;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const enviado = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (enviado) return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* el reporter nunca debe romper la app */
  }
};
