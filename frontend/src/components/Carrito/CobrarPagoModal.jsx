import { useEffect, useState } from 'react';
import { crearMovimientoCuenta, obtenerSaldoCliente } from '../../api/clientes';
import { useIosAlert } from '../alerts';
import { obtenerMensajeErrorApi } from '../../utils/apiError';
import IosModal from '../ui/IosModal';
import IosButton from '../ui/IosButton';
import { IosField, IosInput, IosSelect } from '../ui/IosForm';
import { formatMoney } from '../../utils/format';
import { LIMITES, validarMonto, validarTexto } from '../../utils/validacion';

const FORMAS_PAGO = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta', label: 'Tarjeta' },
];

/** Cobra un pago de cuenta corriente apenas se registra la venta (seña o pago total). */
const CobrarPagoModal = ({
  open,
  onClose,
  clienteId,
  clienteNombre,
  referencia,
  montoSugerido = 0,
  onCobrado,
}) => {
  const { show: alert, toast } = useIosAlert();
  const [monto, setMonto] = useState('');
  const [formaPago, setFormaPago] = useState('efectivo');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState({});
  const [saving, setSaving] = useState(false);
  const [deuda, setDeuda] = useState(null);

  useEffect(() => {
    if (open) {
      setMonto('');
      setFormaPago('efectivo');
      setNota('');
      setErrores({});
      setSaving(false);
      setDeuda(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !clienteId) return undefined;
    let activo = true;
    obtenerSaldoCliente(clienteId)
      .then((res) => {
        if (activo) setDeuda(Number(res.data?.saldo) || 0);
      })
      .catch(() => {
        if (activo) setDeuda(null);
      });
    return () => {
      activo = false;
    };
  }, [open, clienteId]);

  const sinDeuda = deuda !== null && deuda <= 0;

  const handleGuardar = async () => {
    if (saving || sinDeuda) return;
    const errs = {
      monto: validarMonto(monto),
      nota: validarTexto(nota, LIMITES.nota, 'La nota'),
    };
    setErrores(errs);
    if (errs.monto || errs.nota) return;
    const montoNum = Number(monto);
    if (deuda !== null && montoNum > deuda + 0.001) {
      setErrores({ monto: `El pago no puede superar la deuda pendiente (${formatMoney(deuda)})` });
      return;
    }
    setSaving(true);
    try {
      const res = await crearMovimientoCuenta(clienteId, {
        tipo: 'credito',
        origen: 'pago',
        monto: montoNum,
        formaPago,
        referencia: referencia || '',
        nota: nota.trim(),
      });
      const imputadas = (res.data?.imputaciones || []).filter((i) => Number(i.pagado) > 0);
      toast({
        message: imputadas.length > 0
          ? `Pago imputado a ${imputadas.length === 1 ? 'la cuota' : 'las cuotas'} ${imputadas.map((i) => `${i.numero}/${i.totalCuotas}`).join(', ')}`
          : 'Pago registrado',
      });
      onCobrado?.();
      onClose?.();
    } catch (err) {
      alert({ icon: 'error', title: 'Error', message: obtenerMensajeErrorApi(err, 'No se pudo registrar el pago') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <IosModal
      open={open}
      onClose={onClose}
      title={clienteNombre ? `Cobrar pago · ${clienteNombre}` : 'Cobrar pago'}
      confirmText={saving ? 'Guardando…' : 'Registrar pago'}
      onConfirm={handleGuardar}
      confirmDisabled={saving || sinDeuda}
    >
      <div className="space-y-3">
        <IosField label="Monto" required error={errores.monto}>
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
            autoFocus
          />
        </IosField>
        {deuda !== null && (
          <p className={`text-[12px] font-medium ${sinDeuda ? 'text-ios-green' : 'text-ios-secondary'}`}>
            {sinDeuda ? 'El cliente está libre de deuda' : `Deuda actual: ${formatMoney(deuda)}`}
          </p>
        )}
        {montoSugerido > 0 && (
          <IosButton
            size="sm"
            variant="gray"
            onClick={() => setMonto(String(Math.round(montoSugerido * 100) / 100))}
            className="w-full"
            disabled={sinDeuda}
          >
            Pagar venta: {formatMoney(montoSugerido)}
          </IosButton>
        )}
        <IosField label="Forma de pago">
          <IosSelect value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map((fp) => (
              <option key={fp.key} value={fp.key} className="bg-ios-surface2">{fp.label}</option>
            ))}
          </IosSelect>
        </IosField>
        <IosField label="Nota" error={errores.nota}>
          <IosInput
            value={nota}
            maxLength={LIMITES.nota.max}
            invalid={Boolean(errores.nota)}
            onChange={(e) => {
              setErrores((prev) => ({ ...prev, nota: '' }));
              setNota(e.target.value);
            }}
            placeholder="Opcional"
          />
        </IosField>
        {referencia && (
          <p className="text-[11px] text-ios-tertiary">El pago queda referenciado al ticket {referencia}.</p>
        )}
      </div>
    </IosModal>
  );
};

export default CobrarPagoModal;
