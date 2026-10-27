import { useState, useEffect } from 'react';
import { crearRetiroCaja, obtenerRetirosCaja, eliminarRetiroCaja, obtenerDisponibleCaja } from '../../api/retirosCaja';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import { formatMoney } from '../../utils/format';
import { useApi } from '../../hooks/useApi';
import { useIosAlert } from '../../components/alerts';
import IosModal from '../../components/ui/IosModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { IosField, IosInput } from '../../components/ui/IosForm';
import { hayErrores, LIMITES, validarMonto, validarTexto } from '../../utils/validacion';

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const RetiroModal = ({ open, onClose, onDone, usuario, esAdmin }) => {
  const { show: alert, confirm, toast } = useIosAlert();
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState({});
  const [saving, setSaving] = useState(false);

  const retirosApi = useApi(
    async () => {
      const res = await obtenerRetirosCaja({ desde: today(), hasta: today(), offset: new Date().getTimezoneOffset() });
      return { retiros: res.data.retiros || [], total: res.data.total || 0 };
    },
    { auto: false, mensajeError: 'No se pudieron cargar los retiros' }
  );
  const disponibleApi = useApi(
    async () => {
      const res = await obtenerDisponibleCaja({ offset: new Date().getTimezoneOffset() });
      return Number(res.data.disponible) || 0;
    },
    { auto: false, mensajeError: 'No se pudo consultar el efectivo disponible' }
  );

  const { run: fetchWithdrawals, loading: retirosLoading, error: retirosError } = retirosApi;
  const { run: fetchAvailableCash } = disponibleApi;
  const retiros = retirosApi.data?.retiros || [];
  const retirosTotal = retirosApi.data?.total || 0;
  const efectivoDisponible = disponibleApi.error ? null : disponibleApi.data;
  const efectivoError = disponibleApi.error;

  useEffect(() => {
    if (!open) return;
    setMonto('');
    setMotivo('');
    setErrores({});
    fetchWithdrawals();
    fetchAvailableCash();
  }, [open, fetchWithdrawals, fetchAvailableCash]);

  const confirmWithdrawal = async () => {
    if (saving) return;
    const errs = {
      monto: validarMonto(monto),
      motivo: validarTexto(motivo, LIMITES.motivo, 'El motivo'),
    };
    setErrores(errs);
    if (hayErrores(errs)) return;
    const montoNum = Number(monto);
    if (efectivoDisponible == null) {
      alert({
        icon: 'warning',
        title: 'No se pudo verificar',
        message: 'No se pudo consultar el efectivo disponible. Reintentá en unos segundos.',
      });
      fetchAvailableCash();
      return;
    }
    if (montoNum > efectivoDisponible) {
      setErrores({ monto: `Solo hay ${formatMoney(efectivoDisponible)} disponibles en caja` });
      return;
    }
    setSaving(true);
    try {
      await crearRetiroCaja({
        monto: Math.round(montoNum * 100) / 100,
        motivo: motivo.trim(),
        offset: new Date().getTimezoneOffset(),
      });
      setMonto('');
      setMotivo('');
      toast({ message: 'Retiro registrado' });
      fetchWithdrawals();
      fetchAvailableCash();
      onDone?.();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al registrar el retiro') });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWithdrawal = async (id) => {
    const confirmed = await confirm({
      icon: 'warning',
      title: '¿Eliminar este retiro?',
      message: 'El retiro se eliminará del registro',
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await eliminarRetiroCaja(id);
      toast({ message: 'Retiro eliminado' });
      fetchWithdrawals();
      fetchAvailableCash();
      onDone?.();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'Error al eliminar el retiro') });
    }
  };

  return (
    <IosModal
      open={open}
      onClose={onClose}
      title="Retirar Efectivo"
      cancelText="Cerrar"
      confirmText={saving ? 'Guardando…' : 'Registrar retiro'}
      confirmVariant="tinted"
      onConfirm={confirmWithdrawal}
      confirmDisabled={saving}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold border flex items-center justify-between ${
          efectivoDisponible != null && efectivoDisponible > 0
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
        }`}>
          <span>Efectivo disponible en caja</span>
          <span className="tabular-nums">{efectivoDisponible != null ? formatMoney(efectivoDisponible) : '—'}</span>
        </div>
        {efectivoError && (
          <p className="text-amber-400 text-xs">{efectivoError}</p>
        )}

        <div className="bg-ios-surface rounded-2xl border border-ios-separator/30 p-4 space-y-3">
          <IosField label="Monto a retirar" required error={errores.monto}>
            <IosInput
              type="text"
              inputMode="decimal"
              maxLength={12}
              invalid={Boolean(errores.monto)}
              value={monto}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) {
                  setErrores((prev) => ({ ...prev, monto: '' }));
                  setMonto(v);
                }
              }}
              placeholder="0.00"
            />
          </IosField>
          <IosField label="Motivo" required error={errores.motivo}>
            <IosInput
              type="text"
              maxLength={LIMITES.motivo.max}
              invalid={Boolean(errores.motivo)}
              value={motivo}
              onChange={(e) => {
                setErrores((prev) => ({ ...prev, motivo: '' }));
                setMotivo(e.target.value);
              }}
              placeholder="Ej: pago a proveedor, gastos menores..."
            />
          </IosField>
          <IosField label="Retira">
            <div className="px-3.5 py-2.5 bg-ios-surface2 rounded-ios-control text-ios-secondary text-sm truncate">
              {usuario?.nombre || '—'}
            </div>
          </IosField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] text-ios-secondary font-medium">Retiros de hoy</p>
            {retiros.length > 0 && (
              <span className="text-xs text-ios-tertiary font-semibold">
                Total: {formatMoney(retirosTotal)}
              </span>
            )}
          </div>
          {retirosLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="h-6 w-6" />
            </div>
          ) : retirosError ? (
            <p className="text-center text-xs text-ios-red py-5 bg-ios-surface2/50 rounded-2xl">
              {retirosError}
            </p>
          ) : retiros.length === 0 ? (
            <p className="text-center text-xs text-ios-tertiary py-5 bg-ios-surface2/50 rounded-2xl">
              No hay retiros registrados hoy
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {retiros.map((w) => (
                <div key={w._id} className="flex items-center gap-3 bg-ios-surface2/60 rounded-2xl px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ios-label truncate">{formatMoney(w.monto)}</p>
                    <p className="text-[11px] text-ios-tertiary truncate">
                      {w.motivo} · {w.realizadoPor} · {new Date(w.fechaCreacion).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {esAdmin && (
                    <button
                      onClick={() => handleDeleteWithdrawal(w._id)}
                      className="btn-vivo btn-vivo-rojo text-xs px-2.5 py-1 rounded-ios-pill font-semibold shrink-0"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </IosModal>
  );
};

export default RetiroModal;
