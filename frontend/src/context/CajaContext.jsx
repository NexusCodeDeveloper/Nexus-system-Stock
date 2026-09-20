import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { abrirCaja, cerrarCaja, obtenerCajaAbierta, reabrirCaja } from '../api/ventas';
import { useIosAlert } from '../components/alerts';
import { obtenerMensajeErrorApi } from '../utils/apiError';
import IosModal from '../components/ui/IosModal';
import { IosField, IosInput } from '../components/ui/IosForm';
import { formatMoney } from '../utils/format';

const CajaContext = createContext(null);

const hora = (fecha) =>
  fecha ? new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

const FilaResumen = ({ label, valor, cls = 'text-ios-label' }) => (
  <div className="flex items-center justify-between">
    <span className="text-[13px] text-ios-secondary">{label}</span>
    <span className={`text-[13px] font-semibold whitespace-nowrap tabular-nums ${cls}`}>{valor}</span>
  </div>
);

const ResumenCaja = ({ resumen }) => (
  <div className="rounded-2xl px-4 py-3 bg-ios-surface2/70 border border-ios-separator/40 space-y-1.5">
    <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold mb-1">Resumen hasta ahora</p>
    <FilaResumen label="Total vendido" valor={formatMoney(resumen.total)} cls="text-ios-green" />
    <FilaResumen label="Efectivo" valor={formatMoney(resumen.efectivo?.total || 0)} cls="text-green-400" />
    <FilaResumen label="Transferencia" valor={formatMoney(resumen.transferencia?.total || 0)} cls="text-blue-400" />
    <FilaResumen label="Tarjeta" valor={formatMoney(resumen.tarjeta?.total || 0)} cls="text-purple-400" />
    {Number(resumen.totalDevoluciones) > 0 && (
      <FilaResumen label="Devoluciones" valor={`-${formatMoney(resumen.totalDevoluciones)}`} cls="text-ios-red" />
    )}
    {Number(resumen.totalRetiros) > 0 && (
      <FilaResumen label="Retiros" valor={`-${formatMoney(resumen.totalRetiros)}`} cls="text-ios-red" />
    )}
    <FilaResumen label="Efectivo esperado" valor={formatMoney(resumen.efectivoEsperado || 0)} />
  </div>
);

export const CajaProvider = ({ children }) => {
  const { show: alert, toast } = useIosAlert();
  const [caja, setCaja] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cierreHoy, setCierreHoy] = useState(null);
  const [esDeHoy, setEsDeHoy] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [showReabrir, setShowReabrir] = useState(false);
  const [nombre, setNombre] = useState('');
  const [fondo, setFondo] = useState('');
  const [saving, setSaving] = useState(false);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await obtenerCajaAbierta({ offset: new Date().getTimezoneOffset() });
      if (seq !== seqRef.current) return;
      setCaja(res.data?.caja || null);
      setResumen(res.data?.resumen || null);
      setCierreHoy(res.data?.cierreHoy || null);
      setEsDeHoy(res.data?.esDeHoy !== false);
    } catch {
      if (seq !== seqRef.current) return;
      setCaja(null);
      setResumen(null);
      setCierreHoy(null);
      setEsDeHoy(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openAbrir = useCallback(() => {
    setNombre('');
    setFondo('');
    setShowAbrir(true);
  }, []);

  const openCerrar = useCallback(() => {
    setNombre('');
    setShowCerrar(true);
    refresh();
  }, [refresh]);

  const openReabrir = useCallback(() => {
    setNombre('');
    setShowReabrir(true);
  }, []);

  const confirmarAbrir = useCallback(async () => {
    if (saving) return;
    const n = nombre.trim();
    if (n.length < 2) {
      alert({ icon: 'warning', title: 'Nombre requerido', message: 'Cargá el nombre de quien abre la caja' });
      return;
    }
    setSaving(true);
    try {
      await abrirCaja({ nombre: n, fondoInicial: Number(fondo) || 0, offset: new Date().getTimezoneOffset() });
      setShowAbrir(false);
      await refresh();
      toast({ message: `Caja abierta por ${n}` });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo abrir la caja') });
    } finally {
      setSaving(false);
    }
  }, [saving, nombre, fondo, refresh, alert, toast]);

  const confirmarReabrir = useCallback(async () => {
    if (saving) return;
    const n = nombre.trim();
    if (n.length < 2) {
      alert({ icon: 'warning', title: 'Nombre requerido', message: 'Cargá el nombre de quien reabre la caja' });
      return;
    }
    setSaving(true);
    try {
      await reabrirCaja({ nombre: n, offset: new Date().getTimezoneOffset() });
      setShowReabrir(false);
      await refresh();
      toast({ message: `Caja reabierta por ${n}` });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo reabrir la caja') });
    } finally {
      setSaving(false);
    }
  }, [saving, nombre, refresh, alert, toast]);

  const confirmarCerrar = useCallback(async () => {
    if (saving) return;
    const n = nombre.trim();
    if (n.length < 2) {
      alert({ icon: 'warning', title: 'Nombre requerido', message: 'Cargá el nombre de quien cierra la caja' });
      return;
    }
    setSaving(true);
    try {
      const res = await cerrarCaja({ nombre: n, offset: new Date().getTimezoneOffset() });
      setShowCerrar(false);
      await refresh();
      const d = res.data || {};
      await alert({
        icon: 'success',
        title: 'Cierre de caja',
        buttons: [{ text: 'Ver en historial', style: 'default' }],
        content: (
          <div className="space-y-3">
            <div className="text-center pt-1">
              <p className="text-xs text-ios-tertiary">
                {new Date(d.fecha).toLocaleDateString('es-AR')} · Cerró {d.cerradoPor}
              </p>
              <p className="text-[26px] font-bold text-ios-label mt-1 whitespace-nowrap tabular-nums">{formatMoney(d.total)}</p>
              <p className="text-xs text-ios-tertiary mt-0.5">{d.cantidad} unidades vendidas</p>
            </div>
            <div className="pt-3 border-t border-ios-separator/40 space-y-1.5">
              <FilaResumen label="Efectivo" valor={formatMoney(d.efectivo?.total || 0)} cls="text-green-400" />
              <FilaResumen label="Transferencia" valor={formatMoney(d.transferencia?.total || 0)} cls="text-blue-400" />
              <FilaResumen label="Tarjeta" valor={formatMoney(d.tarjeta?.total || 0)} cls="text-purple-400" />
              {Number(d.totalDevoluciones) > 0 && (
                <FilaResumen label="Devoluciones" valor={`-${formatMoney(d.totalDevoluciones)}`} cls="text-ios-red" />
              )}
              {Number(d.totalRetiros) > 0 && (
                <FilaResumen label="Retiros" valor={`-${formatMoney(d.totalRetiros)}`} cls="text-ios-red" />
              )}
              <FilaResumen label="Efectivo esperado" valor={formatMoney(d.efectivoEsperado || 0)} />
            </div>
          </div>
        ),
      });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo cerrar la caja') });
    } finally {
      setSaving(false);
    }
  }, [saving, nombre, refresh, alert]);

  const value = useMemo(
    () => ({ caja, resumen, cierreHoy, esDeHoy, loading, refresh, openAbrir, openCerrar, openReabrir }),
    [caja, resumen, cierreHoy, esDeHoy, loading, refresh, openAbrir, openCerrar, openReabrir]
  );

  return (
    <CajaContext.Provider value={value}>
      {children}

      <IosModal
        open={showAbrir}
        onClose={() => setShowAbrir(false)}
        title="Abrir caja"
        cancelText="Cancelar"
        confirmText={saving ? 'Abriendo…' : 'Abrir caja'}
        onConfirm={confirmarAbrir}
        confirmDisabled={saving}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <IosField label="Nombre de quien abre" required>
            <IosInput
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Escribí tu nombre"
            />
          </IosField>
          <IosField label="Fondo inicial" hint="La plata que ya hay en la caja (cambio). Opcional.">
            <IosInput
              type="text"
              inputMode="decimal"
              value={fondo}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setFondo(v);
              }}
              placeholder="0.00"
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={showReabrir}
        onClose={() => setShowReabrir(false)}
        title="Reabrir caja"
        cancelText="Cancelar"
        confirmText={saving ? 'Reabriendo…' : 'Reabrir caja'}
        onConfirm={confirmarReabrir}
        confirmDisabled={saving}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <div className="rounded-2xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            La caja de hoy ya fue cerrada. Al reabrirla vas a poder seguir vendiendo y al volver a cerrarla se
            recalcularán los totales y se enviará un mail actualizado.
          </div>
          <IosField label="Nombre de quien reabre" required>
            <IosInput
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Escribí tu nombre"
            />
          </IosField>
        </div>
      </IosModal>

      <IosModal
        open={showCerrar}
        onClose={() => setShowCerrar(false)}
        title="Cerrar caja"
        cancelText="Cancelar"
        confirmText={saving ? 'Cerrando…' : 'Confirmar cierre'}
        onConfirm={confirmarCerrar}
        confirmDisabled={saving}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          {caja && (
            <div className="rounded-2xl px-4 py-3 bg-ios-surface2/70 border border-ios-separator/40 text-xs text-ios-secondary space-y-1">
              <p>
                Abierta por <span className="font-semibold text-ios-label">{caja.abiertoPor}</span> a las {hora(caja.abiertaEn)}
              </p>
              {Number(caja.fondoInicial) > 0 && <p>Fondo inicial: {formatMoney(caja.fondoInicial)}</p>}
            </div>
          )}

          {caja && !esDeHoy && (
            <div className="rounded-2xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
              Esta caja es del <span className="font-semibold">{new Date(caja.fecha).toLocaleDateString('es-AR')}</span> (día
              anterior). Al cerrarla, las ventas posteriores a la medianoche quedarán incluidas en ese día.
            </div>
          )}

          {resumen && <ResumenCaja resumen={resumen} />}

          <IosField label="Nombre de quien cierra" required>
            <IosInput
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Escribí tu nombre"
            />
          </IosField>
        </div>
      </IosModal>
    </CajaContext.Provider>
  );
};

export const useCaja = () => {
  const ctx = useContext(CajaContext);
  if (!ctx) throw new Error('useCaja debe usarse dentro de <CajaProvider>');
  return ctx;
};
