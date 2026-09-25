import { useEffect, useRef, useState } from 'react';
import IosModal from '../ui/IosModal';
import IosSegmented from '../ui/IosSegmented';
import { evaluarExpresion, unirEntrada } from '../../utils/calculadora';

const MODOS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Científica', value: 'cientifica' },
];

const VARIANTES = {
  numero: 'bg-ios-surface2 text-ios-label hover:bg-ios-surface3',
  funcion: 'bg-ios-surface2/60 text-ios-secondary hover:bg-ios-surface3',
  operador: 'bg-ios-tint/15 text-ios-tint hover:bg-ios-tint/25',
  accion: 'bg-ios-surface3 text-ios-secondary hover:bg-ios-hover/10',
  igual: 'bg-gradient-to-b from-[#0E8CFF] to-ios-tint text-white shadow-[0_4px_14px_rgba(10,132,255,0.35)]',
  activo: 'bg-ios-tint/20 text-ios-tint',
};

const Boton = ({ variante = 'numero', chico = false, className = '', children, ...props }) => (
  <button
    type="button"
    className={`ios-btn-press rounded-ios-control font-semibold transition-colors ${
      chico ? 'py-2.5 text-[13px]' : 'py-3 text-[15px]'
    } ${VARIANTES[variante]} ${className}`}
    {...props}
  >
    {children}
  </button>
);

const CONTINUA_RESULTADO = /^[+\-×÷^%!]$/;

const Calculadora = ({ open, onClose }) => {
  const [modo, setModo] = useState('normal');
  const [grados, setGrados] = useState(true);
  const [expresion, setExpresion] = useState('');
  const [justEvaluado, setJustEvaluado] = useState(false);
  const [error, setError] = useState('');
  const teclaRef = useRef(null);

  const agregar = (valor) => {
    setError('');
    let base = expresion;
    if (justEvaluado) {
      base = CONTINUA_RESULTADO.test(valor) || valor.startsWith('^') ? base : '';
      setJustEvaluado(false);
    }
    setExpresion(unirEntrada(base, valor));
  };

  const borrar = () => {
    setError('');
    setJustEvaluado(false);
    setExpresion((prev) => prev.slice(0, -1));
  };

  const limpiar = () => {
    setError('');
    setJustEvaluado(false);
    setExpresion('');
  };

  const cambiarSigno = () => {
    setError('');
    setJustEvaluado(false);
    const coincidencia = expresion.match(/(\d+\.?\d*)$/);
    if (!coincidencia) return;
    const inicio = expresion.length - coincidencia[0].length;
    const previo = expresion[inicio - 1];
    const antesDelSigno = expresion[inicio - 2];
    if (previo === '-' && (inicio - 1 === 0 || /[+\-×÷^(]/.test(antesDelSigno))) {
      setExpresion(expresion.slice(0, inicio - 1) + coincidencia[0]);
    } else {
      setExpresion(expresion.slice(0, inicio) + '-' + coincidencia[0]);
    }
  };

  const evaluar = () => {
    if (!expresion.trim()) return;
    try {
      const valor = evaluarExpresion(expresion, { grados });
      setExpresion(String(valor));
      setJustEvaluado(true);
      setError('');
    } catch {
      setError('Expresión inválida');
    }
  };

  const preview = (() => {
    if (error || justEvaluado || !expresion.trim()) return '';
    try {
      return String(evaluarExpresion(expresion, { grados }));
    } catch {
      return '';
    }
  })();

  teclaRef.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9.]$/.test(k)) { e.preventDefault(); agregar(k); return; }
    if (k === '+') { agregar('+'); return; }
    if (k === '-') { agregar('−'); return; }
    if (k === '*') { agregar('×'); return; }
    if (k === '/') { e.preventDefault(); agregar('÷'); return; }
    if (k === '^') { agregar('^'); return; }
    if (k === '(' || k === ')') { agregar(k); return; }
    if (k === '%') { agregar('%'); return; }
    if (k === '!') { agregar('!'); return; }
    if (k === '=') { e.preventDefault(); evaluar(); return; }
    if (k === 'Enter') {
      if (document.activeElement?.tagName === 'BUTTON') return;
      e.preventDefault();
      evaluar();
      return;
    }
    if (k === 'Backspace') { e.preventDefault(); borrar(); }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => teclaRef.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <IosModal open={open} onClose={onClose} title="Calculadora" showClose maxWidth="max-w-sm">
      <div className="space-y-3">
        <IosSegmented options={MODOS} value={modo} onChange={setModo} className="w-full" />

        <div className="rounded-2xl bg-ios-surface2 px-4 py-3">
          <div className="overflow-x-auto">
            <p className={`text-right text-3xl font-semibold tabular-nums whitespace-nowrap ${error ? 'text-ios-red' : 'text-ios-label'}`}>
              {error ? 'Error' : (expresion || '0')}
            </p>
          </div>
          <p className="text-right text-xs text-ios-tertiary h-4 tabular-nums truncate">
            {error || (preview ? `= ${preview}` : '')}
          </p>
        </div>

        {modo === 'cientifica' && (
          <div className="grid grid-cols-5 gap-2">
            <Boton chico variante="funcion" onClick={() => agregar('sin(')}>sin</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('cos(')}>cos</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('tan(')}>tan</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('(')}>(</Boton>
            <Boton chico variante="funcion" onClick={() => agregar(')')}>)</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('ln(')}>ln</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('log(')}>log</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('√(')}>√</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('^2')}>x²</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('^')}>xʸ</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('π')}>π</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('e')}>e</Boton>
            <Boton chico variante="funcion" onClick={() => agregar('!')}>n!</Boton>
            <Boton chico variante={grados ? 'activo' : 'funcion'} onClick={() => setGrados(!grados)}>
              {grados ? 'DEG' : 'RAD'}
            </Boton>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <Boton variante="accion" onClick={limpiar}>AC</Boton>
          <Boton variante="accion" onClick={borrar}>⌫</Boton>
          <Boton variante="accion" onClick={() => agregar('%')}>%</Boton>
          <Boton variante="operador" onClick={() => agregar('÷')}>÷</Boton>

          <Boton onClick={() => agregar('7')}>7</Boton>
          <Boton onClick={() => agregar('8')}>8</Boton>
          <Boton onClick={() => agregar('9')}>9</Boton>
          <Boton variante="operador" onClick={() => agregar('×')}>×</Boton>

          <Boton onClick={() => agregar('4')}>4</Boton>
          <Boton onClick={() => agregar('5')}>5</Boton>
          <Boton onClick={() => agregar('6')}>6</Boton>
          <Boton variante="operador" onClick={() => agregar('−')}>−</Boton>

          <Boton onClick={() => agregar('1')}>1</Boton>
          <Boton onClick={() => agregar('2')}>2</Boton>
          <Boton onClick={() => agregar('3')}>3</Boton>
          <Boton variante="operador" onClick={() => agregar('+')}>+</Boton>

          <Boton variante="accion" onClick={cambiarSigno}>±</Boton>
          <Boton onClick={() => agregar('0')}>0</Boton>
          <Boton onClick={() => agregar('.')}>.</Boton>
          <Boton variante="igual" onClick={evaluar}>=</Boton>
        </div>
      </div>
    </IosModal>
  );
};

export default Calculadora;
