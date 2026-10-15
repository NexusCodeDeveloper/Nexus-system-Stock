import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from 'recharts';
import { obtenerAnaliticaVentas } from '../../api/ventas';
import { useApi } from '../../hooks/useApi';
import { escucharPush } from '../../services/GestorPush';
import { formatMoney } from '../../utils/format';
import LoadingSpinner from '../common/LoadingSpinner';

const TINT = '#0A84FF';
const AMBAR = '#FF9F0A';
const GRIS = '#8E8E93';
const GRILLA = 'rgba(142,142,147,0.22)';

const PALETA_PRODUCTOS = ['#FF9F0A', '#FF453A', '#5E5CE6', '#FF375F', '#40C8E0'];
const PALETA_EMPLEADOS = ['#32D74B', '#BF5AF2', '#FFD60A', '#64D2FF', '#AC8E68'];

const PERIODOS = [
  { value: 'dia', label: 'Día que más se vendió', singular: 'Día', clave: 'fecha' },
  { value: 'semana', label: 'Semana que más se vendió', singular: 'Semana', clave: 'semana' },
  { value: 'mes', label: 'Mes que más se vendió', singular: 'Mes', clave: 'mes' },
];

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const etiquetaDia = (clave) => {
  const partes = String(clave).split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : clave;
};

const etiquetaMes = (clave) => {
  const [anio, mes] = String(clave).split('-');
  const nombre = MESES_CORTOS[Number(mes) - 1];
  return nombre ? `${nombre} ${anio.slice(2)}` : clave;
};

const formatoEjeDinero = (valor) => {
  const n = Number(valor) || 0;
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k`;
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};

const tituloPunto = (punto, periodo) => {
  if (periodo === 'mes') return etiquetaMes(punto?.mes);
  if (periodo === 'semana') return `Semana del ${etiquetaDia(punto?.semana)}`;
  return etiquetaDia(punto?.fecha);
};

const CajaTooltip = ({ children }) => (
  <div className="rounded-ios-control border border-ios-separator/40 bg-ios-surface2/95 px-3 py-2 shadow-ios-card">
    {children}
  </div>
);

const TooltipLineas = ({ active, payload, series, periodo }) => {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload || {};
  return (
    <CajaTooltip>
      <p className="text-[11px] font-semibold text-ios-secondary mb-1.5">{tituloPunto(punto, periodo)}</p>
      <div className="space-y-1">
        {series.map((serie) => (
          <div key={serie.key} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: serie.color }} />
            <span className="text-[11px] text-ios-secondary flex-1 truncate max-w-[160px]">{serie.label}</span>
            <span className="text-xs font-semibold text-ios-label tabular-nums">
              {serie.tipo === 'unidades' ? `${punto[serie.key] || 0} unid.` : formatMoney(punto[serie.key] || 0)}
            </span>
          </div>
        ))}
      </div>
    </CajaTooltip>
  );
};

const Badge = ({ activo, onClick, color, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={activo}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-ios-pill text-[13px] font-semibold transition-all duration-150 active:scale-[0.97] hover:-translate-y-0.5 ${
      activo
        ? 'text-white ring-1 ring-white/25'
        : 'text-ios-tertiary bg-ios-surface3 dark:bg-ios-surface2 ring-1 ring-ios-separator/40 hover:bg-ios-separator/40'
    }`}
    style={activo ? { backgroundColor: color, boxShadow: `0 8px 20px -10px ${color}` } : undefined}
  >
    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: activo ? 'rgba(255,255,255,0.85)' : color }} />
    <span>{children}</span>
  </button>
);

const SinDatos = ({ mensaje = 'No hay ventas en el período seleccionado.' }) => (
  <div className="h-64 flex items-center justify-center text-center px-6 text-sm text-ios-tertiary">{mensaje}</div>
);

const GraficosVentas = ({ desde, hasta }) => {
  const [periodo, setPeriodo] = useState('dia');
  const [verProductos, setVerProductos] = useState(false);
  const [verEmpleados, setVerEmpleados] = useState(false);

  const { data, loading, error, run } = useApi(
    async () => {
      const offset = new Date().getTimezoneOffset();
      const res = await obtenerAnaliticaVentas({ desde, hasta, offset });
      return res.data;
    },
    { deps: [desde, hasta], mensajeError: 'Error al cargar los gráficos' }
  );

  useEffect(() => {
    const off = escucharPush((payload) => {
      if (['venta', 'devolucion', 'cierre'].includes(payload?.tipo)) run();
    });
    return off;
  }, [run]);

  const productosSeries = useMemo(
    () =>
      (data?.productos || []).map((fila, i) => ({
        key: fila.id,
        label: fila.label,
        tipo: 'unidades',
        color: PALETA_PRODUCTOS[i % PALETA_PRODUCTOS.length],
        total: fila.unidades,
      })),
    [data]
  );

  const empleadosSeries = useMemo(
    () =>
      (data?.empleados || []).map((fila, i) => ({
        key: fila.id,
        label: fila.empleado,
        tipo: 'dinero',
        color: PALETA_EMPLEADOS[i % PALETA_EMPLEADOS.length],
        total: fila.total,
      })),
    [data]
  );

  const puntosDe = (p) => data?.ejes?.[p]?.puntos || [];
  const periodoActivo = (() => {
    if (puntosDe(periodo).length > 0) return periodo;
    if (puntosDe('semana').length > 0) return 'semana';
    if (puntosDe('mes').length > 0) return 'mes';
    return periodo;
  })();

  const infoPeriodo = PERIODOS.find((p) => p.value === periodoActivo) || PERIODOS[0];
  const puntos = puntosDe(periodoActivo);
  const aviso =
    periodoActivo !== periodo
      ? `El período es muy extenso para el detalle por ${PERIODOS.find((p) => p.value === periodo)?.singular.toLowerCase()}; se muestra por ${infoPeriodo.singular.toLowerCase()}.`
      : '';

  const lineas = [
    { key: 'total', label: 'Total vendido', tipo: 'dinero', color: TINT },
    ...(verProductos ? productosSeries : []),
    ...(verEmpleados ? empleadosSeries : []),
  ];

  const hayUnidades = lineas.some((linea) => linea.tipo === 'unidades');
  const sinVentas = !data || (data.resumen?.total === 0 && data.resumen?.cantidad === 0);
  const maximo =
    puntos.length > 0
      ? puntos.reduce((mejor, punto) => (punto.total > mejor.total ? punto : mejor), puntos[0])
      : null;

  const formatearX = (valor) => {
    if (periodoActivo === 'mes') return etiquetaMes(valor);
    if (periodoActivo === 'semana') return `Sem ${etiquetaDia(valor)}`;
    return etiquetaDia(valor);
  };

  const leyenda = [
    ...(verProductos ? productosSeries : []),
    ...(verEmpleados ? empleadosSeries : []),
  ];

  const renderGrafico = () => {
    if (sinVentas) return <SinDatos />;
    return (
      <>
        {aviso && <p className="mb-3 text-xs text-ios-tertiary">{aviso}</p>}
        {maximo && maximo.total > 0 && (
          <p className="mb-3 text-xs text-ios-secondary">
            {infoPeriodo.singular} que más se vendió:{' '}
            <span className="font-semibold text-ios-label">{formatearX(maximo[infoPeriodo.clave])}</span> con{' '}
            <span className="font-semibold text-ios-green">{formatMoney(maximo.total)}</span>
          </p>
        )}
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={puntos} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRILLA} vertical={false} />
            <XAxis
              dataKey={infoPeriodo.clave}
              tickFormatter={formatearX}
              tick={{ fill: GRIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="dinero"
              tickFormatter={formatoEjeDinero}
              tick={{ fill: GRIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              allowDecimals={false}
            />
            {hayUnidades && (
              <YAxis
                yAxisId="unidades"
                orientation="right"
                tick={{ fill: GRIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
            )}
            <Tooltip content={<TooltipLineas series={lineas} periodo={periodoActivo} />} cursor={{ stroke: GRILLA, strokeWidth: 1 }} />
            {maximo && maximo.total > 0 && (
              <ReferenceDot
                x={maximo[infoPeriodo.clave]}
                y={maximo.total}
                yAxisId="dinero"
                r={5}
                fill={AMBAR}
                stroke="#FFFFFF"
                strokeWidth={1.5}
                isFront
              />
            )}
            {lineas.map((linea) => (
              <Line
                key={linea.key}
                type="linear"
                dataKey={linea.key}
                yAxisId={linea.tipo === 'unidades' ? 'unidades' : 'dinero'}
                stroke={linea.color}
                strokeWidth={2.2}
                dot={puntos.length <= 40 ? { r: 2.4, strokeWidth: 0, fill: linea.color } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </>
    );
  };

  return (
    <div className="bg-ios-surface border border-ios-separator/30 rounded-3xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <p className="text-sm text-ios-secondary">
          Total del período:{' '}
          <span className="font-bold text-ios-green">{formatMoney(data?.resumen?.total || 0)}</span>
          <span className="text-ios-tertiary"> · {data?.resumen?.cantidad || 0} unidades</span>
        </p>
      </div>

      {data && !sinVentas && (
        <div className="space-y-4 mb-5">
          <div>
            <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold mb-2">¿Qué se vendió más?</p>
            <div className="flex flex-wrap gap-2">
              {PERIODOS.map((opcion) => (
                <Badge
                  key={opcion.value}
                  activo={periodoActivo === opcion.value}
                  onClick={() => setPeriodo(opcion.value)}
                  color={TINT}
                >
                  {opcion.label}
                </Badge>
              ))}
            </div>
          </div>

          {(productosSeries.length > 0 || empleadosSeries.length > 0) && (
            <div>
              <p className="text-[11px] text-ios-tertiary uppercase tracking-wider font-semibold mb-2">Comparar en el gráfico</p>
              <div className="flex flex-wrap gap-2">
                {productosSeries.length > 0 && (
                  <Badge activo={verProductos} onClick={() => setVerProductos((v) => !v)} color={AMBAR}>
                    Productos que más se vendieron
                  </Badge>
                )}
                {empleadosSeries.length > 0 && (
                  <Badge activo={verEmpleados} onClick={() => setVerEmpleados((v) => !v)} color="#32D74B">
                    Empleados que más vendieron
                  </Badge>
                )}
              </div>
              {leyenda.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                  {leyenda.map((serie) => (
                    <span key={serie.key} className="flex items-center gap-1.5 text-[11px] text-ios-secondary">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: serie.color }} />
                      {serie.label} ·{' '}
                      <span className="font-semibold text-ios-label">
                        {serie.tipo === 'unidades' ? `${serie.total} unid.` : formatMoney(serie.total)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="mb-2 px-4 py-3 bg-ios-red/10 border border-ios-red/25 rounded-ios-control text-ios-red text-sm font-medium">
          {error}
        </div>
      ) : loading && !data ? (
        <div className="h-64 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        renderGrafico()
      )}
    </div>
  );
};

export default GraficosVentas;
