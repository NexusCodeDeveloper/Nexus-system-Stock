import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CajaContext } from './cajaContexto';
import { abrirCaja, cerrarCaja, obtenerCajaAbierta } from '../api/ventas';
import { useIosAlert } from '../components/alerts';
import { obtenerMensajeErrorApi } from '../utils/apiError';
import IosModal from '../components/ui/IosModal';
import { IosField, IosInput } from '../components/ui/IosForm';
import IosSegmented from '../components/ui/IosSegmented';
import IosToggle from '../components/ui/IosToggle';
import { formatMoney, formatDateShort } from '../utils/format';
import { LIMITES, MONTO, validarNumero, validarTexto } from '../utils/validacion';

const hora = (fecha) =>
  fecha ? new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

const TURNOS_CIERRE = [
  { value: 'manana', label: 'Mañana' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'dia', label: 'Día' },
];

const turnoLabel = (t) => (t === 'manana' ? 'Mañana' : t === 'tarde' ? 'Tarde' : 'Día completo');

const turnoSugerido = () => (new Date().getHours() < 14 ? 'manana' : 'tarde');

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
    {Number(resumen.cuentaCorriente?.total) > 0 && (
      <FilaResumen label="Cuenta corriente" valor={formatMoney(resumen.cuentaCorriente?.total || 0)} cls="text-orange-400" />
    )}
    {Number(resumen.totalDevoluciones) > 0 && (
      <FilaResumen label="Devoluciones" valor={`-${formatMoney(resumen.totalDevoluciones)}`} cls="text-ios-red" />
    )}
    {Number(resumen.totalRetiros) > 0 && (
      <FilaResumen label="Retiros" valor={`-${formatMoney(resumen.totalRetiros)}`} cls="text-ios-red" />
    )}
    {Number(resumen.totalCobrosCuentaCorriente) > 0 && (
      <FilaResumen label="Cobros cuenta corriente" valor={formatMoney(resumen.totalCobrosCuentaCorriente || 0)} cls="text-green-400" />
    )}
    <FilaResumen label="Efectivo esperado" valor={formatMoney(resumen.efectivoEsperado || 0)} />
  </div>
);

export const CajaProvider = ({ children }) => {
  const { show: alert, toast } = useIosAlert();
  const navigate = useNavigate();
  const [caja, setCaja] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [turnosCerrados, setTurnosCerrados] = useState([]);
  const [diaCompleto, setDiaCompleto] = useState(false);
  const [esDeHoy, setEsDeHoy] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [nombre, setNombre] = useState('');
  const [fondo, setFondo] = useState('');
  const [errorNombre, setErrorNombre] = useState('');
  const [errorFondo, setErrorFondo] = useState('');
  const [turno, setTurno] = useState('manana');
  const [enviarReporteDia, setEnviarReporteDia] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const res = await obtenerCajaAbierta({ offset: new Date().getTimezoneOffset() });
      if (seq !== seqRef.current) return;
      setCaja(res.data?.caja || null);
      setResumen(res.data?.resumen || null);
      setTurnosCerrados(Array.isArray(res.data?.turnosCerrados) ? res.data.turnosCerrados : []);
      setDiaCompleto(res.data?.diaCompleto === true);
      setEsDeHoy(res.data?.esDeHoy !== false);
      setError(null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(obtenerMensajeErrorApi(err, 'No se pudo consultar el estado de la caja'));
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
    setErrorNombre('');
    setErrorFondo('');
    setShowAbrir(true);
  }, []);

  const openCerrar = useCallback(() => {
    setNombre('');
    setErrorNombre('');
    setTurno(turnoSugerido());
    setEnviarReporteDia(true);
    setShowCerrar(true);
    refresh();
  }, [refresh]);

  const confirmarAbrir = useCallback(async () => {
    if (saving) return;
    const n = nombre.trim();
    const errNombre = validarTexto(n, LIMITES.nombreCaja, 'El nombre');
    const errFondo = fondo === '' ? '' : validarNumero(fondo, { min: 0, max: MONTO.max, etiqueta: 'El fondo inicial' });
    setErrorNombre(errNombre);
    setErrorFondo(errFondo);
    if (errNombre || errFondo) return;
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

  const confirmarCerrar = useCallback(async () => {
    if (saving) return;
    const n = nombre.trim();
    const errNombre = validarTexto(n, LIMITES.nombreCaja, 'El nombre');
    setErrorNombre(errNombre);
    if (errNombre) return;
    setSaving(true);
    try {
      const res = await cerrarCaja({
        nombre: n,
        turno,
        enviarReporteDia: turno === 'tarde' ? enviarReporteDia : false,
        offset: new Date().getTimezoneOffset(),
      });
      setShowCerrar(false);
      await refresh();
      const d = res.data || {};
      const turnoCerrado = d.turno || turno;
      await alert({
        icon: 'success',
        title: turnoCerrado === 'dia' ? 'Cierre de caja' : `Cierre turno ${turnoLabel(turnoCerrado)}`,
        buttons: [{ text: 'Ver en historial', style: 'default', action: () => navigate('/ventas', { state: { tab: 'cierres' } }) }],
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
              {Number(d.cuentaCorriente?.total) > 0 && (
                <FilaResumen label="Cuenta corriente" valor={formatMoney(d.cuentaCorriente?.total || 0)} cls="text-orange-400" />
              )}
              {Number(d.totalDevoluciones) > 0 && (
                <FilaResumen label="Devoluciones" valor={`-${formatMoney(d.totalDevoluciones)}`} cls="text-ios-red" />
              )}
              {Number(d.totalRetiros) > 0 && (
                <FilaResumen label="Retiros" valor={`-${formatMoney(d.totalRetiros)}`} cls="text-ios-red" />
              )}
              {Number(d.totalCobrosCuentaCorriente) > 0 && (
                <FilaResumen label="Cobros cuenta corriente" valor={formatMoney(d.totalCobrosCuentaCorriente || 0)} cls="text-green-400" />
              )}
              <FilaResumen label="Efectivo esperado" valor={formatMoney(d.efectivoEsperado || 0)} />
            </div>
            {turnoCerrado === 'manana' && (
              <p className="text-[11px] text-ios-tertiary text-center">
                Para el turno tarde, abrí una caja nueva desde Ventas.
              </p>
            )}
            {turnoCerrado === 'tarde' && enviarReporteDia && (
              <p className="text-[11px] text-ios-tertiary text-center">
                También se enviará el reporte del total del día por correo.
              </p>
            )}
          </div>
        ),
      });
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo cerrar la caja') });
    } finally {
      setSaving(false);
    }
  }, [saving, nombre, turno, enviarReporteDia, refresh, alert, navigate]);

  const value = useMemo(
    () => ({ caja, resumen, turnosCerrados, diaCompleto, esDeHoy, loading, error, refresh, openAbrir, openCerrar }),
    [caja, resumen, turnosCerrados, diaCompleto, esDeHoy, loading, error, refresh, openAbrir, openCerrar]
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
          <IosField label="Nombre de quien abre" required error={errorNombre}>
            <IosInput
              type="text"
              minLength={LIMITES.nombreCaja.min}
              maxLength={LIMITES.nombreCaja.max}
              invalid={Boolean(errorNombre)}
              value={nombre}
              onChange={(e) => {
                setErrorNombre('');
                setNombre(e.target.value);
              }}
              placeholder="Escribí tu nombre"
            />
          </IosField>
          <IosField label="Fondo inicial" hint="La plata que ya hay en la caja (cambio). Opcional." error={errorFondo}>
            <IosInput
              type="text"
              inputMode="decimal"
              maxLength={12}
              invalid={Boolean(errorFondo)}
              value={fondo}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) {
                  setErrorFondo('');
                  setFondo(v);
                }
              }}
              placeholder="0.00"
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
              Esta caja es del <span className="font-semibold">{formatDateShort(caja.fecha)}</span> (día
              anterior). Al cerrarla, las ventas posteriores a la medianoche quedarán incluidas en ese día.
            </div>
          )}

          {resumen && <ResumenCaja resumen={resumen} />}

          <IosField label="Turno que se cierra" required>
            <IosSegmented options={TURNOS_CIERRE} value={turno} onChange={setTurno} className="w-full" />
          </IosField>

          {turno === 'tarde' && (
            <div className="flex items-start justify-between gap-3 rounded-2xl px-4 py-3 bg-ios-surface2/70 border border-ios-separator/40">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ios-label">Enviar reporte del total del día</p>
                <p className="text-[11px] text-ios-tertiary mt-0.5">
                  Recibirás otro correo con los totales del día y el desglose por turno.
                </p>
              </div>
              <IosToggle checked={enviarReporteDia} onChange={setEnviarReporteDia} />
            </div>
          )}

          <IosField label="Nombre de quien cierra" required error={errorNombre}>
            <IosInput
              type="text"
              minLength={LIMITES.nombreCaja.min}
              maxLength={LIMITES.nombreCaja.max}
              invalid={Boolean(errorNombre)}
              value={nombre}
              onChange={(e) => {
                setErrorNombre('');
                setNombre(e.target.value);
              }}
              placeholder="Escribí tu nombre"
            />
          </IosField>
        </div>
      </IosModal>
    </CajaContext.Provider>
  );
};


