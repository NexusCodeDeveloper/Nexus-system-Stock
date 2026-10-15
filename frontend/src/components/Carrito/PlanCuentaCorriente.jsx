import { useState } from 'react';
import { useCarrito } from '../../context/carritoContexto';
import IosToggle from '../ui/IosToggle';
import { IosField, IosInput, IosSelect } from '../ui/IosForm';
import { IconChevronRight } from '../ui/icons';
import { formatMoney } from '../../utils/format';
import SelectorCliente from './SelectorCliente';

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sumarMeses = (fecha, meses) => {
  const y = fecha.getFullYear();
  const m = fecha.getMonth() + meses;
  const dia = fecha.getDate();
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dia, ultimoDia));
};

const fechaVencimientoPorDefecto = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
};

const formatearFecha = (fecha) => fecha.toLocaleDateString('es-AR');

/**
 * Seleccion de cliente y plan de pago cuando la venta usa cuenta corriente.
 * Se usa tanto en el panel del carrito de escritorio como en el modal del celular.
 */
const PlanCuentaCorriente = () => {
  const {
    sellSplit,
    sellMetodoPago,
    sellMetodo2,
    sellMonto1,
    sellMonto2,
    finalTotal,
    sellCliente,
    setSellCliente,
    sellCuotas,
    setSellCuotas,
    sellPrimerVencimiento,
    setSellPrimerVencimiento,
    sellAplicarInteres,
    setSellAplicarInteres,
    sellInteres,
    setSellInteres,
    sellMora,
    setSellMora,
    ajustesCuenta,
  } = useCarrito();
  const [showSelector, setShowSelector] = useState(false);

  const usaCuentaCorriente = sellSplit
    ? sellMetodoPago === 'cuentaCorriente' || sellMetodo2 === 'cuentaCorriente'
    : sellMetodoPago === 'cuentaCorriente';

  if (!usaCuentaCorriente) return null;

  const montoCuenta = sellSplit
    ? sellMetodoPago === 'cuentaCorriente'
      ? sellMonto1
      : Number(sellMonto2) || 0
    : finalTotal;
  const cuotasNum = Math.min(Math.max(parseInt(sellCuotas, 10) || 1, 1), 24);
  const interesPorcentaje = sellAplicarInteres
    ? sellInteres !== ''
      ? Number(sellInteres) || 0
      : Number(ajustesCuenta?.interesFinanciacionPorcentaje) || 0
    : 0;
  const interesMonto = Math.round(montoCuenta * interesPorcentaje) / 100;
  const totalFinanciado = montoCuenta + interesMonto;
  const valorCuota = totalFinanciado / cuotasNum;
  const primerVencimiento = sellPrimerVencimiento
    ? new Date(`${sellPrimerVencimiento}T00:00:00`)
    : fechaVencimientoPorDefecto();
  const ultimoVencimiento = sumarMeses(primerVencimiento, cuotasNum - 1);

  return (
    <>
      <div>
        <p className="text-[12px] text-ios-secondary font-medium mb-1.5">Cliente (cuenta corriente)</p>
        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-ios-control text-left btn-vivo btn-vivo-gris"
        >
          {sellCliente ? (
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white truncate">{sellCliente.nombre}</span>
              <span className="block text-[11px] text-white/70 tabular-nums">
                Saldo actual: {formatMoney(sellCliente.saldo)}
              </span>
            </span>
          ) : (
            <span className="text-sm text-white/85">Elegir cliente…</span>
          )}
          <IconChevronRight className="w-4 h-4 text-white/70 shrink-0" />
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-ios-orange/25 bg-ios-orange/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-ios-orange">Plan de pago</p>
          <span className="text-[11px] text-ios-tertiary tabular-nums">
            Cta. cte.: {formatMoney(montoCuenta)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <IosField label="Cuotas">
            <IosSelect value={sellCuotas} onChange={(e) => setSellCuotas(e.target.value)}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={String(n)} className="bg-ios-surface2">{n}</option>
              ))}
            </IosSelect>
          </IosField>
          <IosField label="Primer vencimiento">
            <IosInput
              type="date"
              min={hoyISO()}
              value={sellPrimerVencimiento}
              onChange={(e) => setSellPrimerVencimiento(e.target.value)}
            />
          </IosField>
        </div>

        <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
          <span className="flex items-center gap-2.5">
            <IosToggle checked={sellAplicarInteres} onChange={() => setSellAplicarInteres((v) => !v)} />
            <span className="text-[13px] text-ios-secondary font-medium">Aplicar interés</span>
          </span>
          {sellAplicarInteres && (
            <span className="text-[12px] text-ios-orange font-semibold tabular-nums">
              +{formatMoney(interesMonto)}
            </span>
          )}
        </label>

        {sellAplicarInteres && (
          <IosField label="Interés de financiación %">
            <IosInput
              type="text"
              inputMode="decimal"
              value={sellInteres}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d{1,4}(\.\d{0,2})?$/.test(v)) setSellInteres(v);
              }}
              placeholder={`${Number(ajustesCuenta?.interesFinanciacionPorcentaje ?? 10)}% (por defecto)`}
            />
          </IosField>
        )}

        <IosField label="Mora por cuota atrasada % (mensual)">
          <IosInput
            type="text"
            inputMode="decimal"
            value={sellMora}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d{1,4}(\.\d{0,2})?$/.test(v)) setSellMora(v);
            }}
            placeholder={`${Number(ajustesCuenta?.tasaMoraMensualPorcentaje ?? 5)}% (por defecto)`}
          />
        </IosField>

        <div className="rounded-ios-control bg-ios-surface2/70 px-3 py-2 space-y-0.5">
          <p className="text-[12px] text-ios-label font-semibold tabular-nums">
            {cuotasNum === 1
              ? `1 pago de ${formatMoney(totalFinanciado)}`
              : `${cuotasNum} cuotas de ${formatMoney(valorCuota)}`}
          </p>
          <p className="text-[11px] text-ios-tertiary">
            {cuotasNum === 1
              ? `Vence el ${formatearFecha(primerVencimiento)}`
              : `Primera: ${formatearFecha(primerVencimiento)} · Última: ${formatearFecha(ultimoVencimiento)}`}
          </p>
          {sellAplicarInteres && interesMonto > 0 && (
            <p className="text-[11px] text-ios-orange">
              Total financiado {formatMoney(totalFinanciado)} (interés {formatMoney(interesMonto)})
            </p>
          )}
        </div>
      </div>

      <SelectorCliente
        open={showSelector}
        onClose={() => setShowSelector(false)}
        onSelect={setSellCliente}
        seleccionado={sellCliente}
      />
    </>
  );
};

export default PlanCuentaCorriente;
