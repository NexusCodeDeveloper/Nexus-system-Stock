const OPERADORES = {
  '+': { prec: 1, derecha: false },
  '-': { prec: 1, derecha: false },
  '*': { prec: 2, derecha: false },
  '/': { prec: 2, derecha: false },
  'u-': { prec: 2.5, derecha: true },
  '^': { prec: 3, derecha: true },
};

const FUNCIONES = new Set(['sin', 'cos', 'tan', 'ln', 'log', '√']);
const CONSTANTES = { pi: Math.PI, e: Math.E };

const limpiarTrigonometrica = (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12)));

const factorial = (n) => {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial inválido');
  let resultado = 1;
  for (let i = 2; i <= n; i += 1) resultado *= i;
  return resultado;
};

const tokenizar = (expresion) => {
  const tokens = [];
  const s = String(expresion).replace(/\s+/g, '');
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (/[0-9.]/.test(c)) {
      let numero = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        numero += s[i];
        i += 1;
      }
      if (!/^\d+\.?\d*$|^\.\d+$/.test(numero)) throw new Error('Número inválido');
      tokens.push({ tipo: 'numero', valor: Number(numero) });
      continue;
    }

    if (c === '×' || c === '*') { tokens.push({ tipo: 'operador', valor: '*' }); i += 1; continue; }
    if (c === '÷' || c === '/') { tokens.push({ tipo: 'operador', valor: '/' }); i += 1; continue; }
    if (c === '−' || c === '-') { tokens.push({ tipo: 'operador', valor: '-' }); i += 1; continue; }
    if (c === '+' || c === '^') { tokens.push({ tipo: 'operador', valor: c }); i += 1; continue; }
    if (c === '(' || c === ')') { tokens.push({ tipo: 'parentesis', valor: c }); i += 1; continue; }
    if (c === '%' || c === '!') { tokens.push({ tipo: 'postfijo', valor: c }); i += 1; continue; }
    if (c === '√') { tokens.push({ tipo: 'funcion', valor: '√' }); i += 1; continue; }
    if (c === 'π') { tokens.push({ tipo: 'numero', valor: Math.PI }); i += 1; continue; }

    if (/[a-z]/i.test(c)) {
      let palabra = '';
      while (i < s.length && /[a-z]/i.test(s[i])) {
        palabra += s[i];
        i += 1;
      }
      if (FUNCIONES.has(palabra)) { tokens.push({ tipo: 'funcion', valor: palabra }); continue; }
      if (palabra in CONSTANTES) { tokens.push({ tipo: 'numero', valor: CONSTANTES[palabra] }); continue; }
      throw new Error(`Símbolo desconocido: ${palabra}`);
    }

    throw new Error(`Símbolo desconocido: ${c}`);
  }

  return tokens;
};

const aRPN = (tokens) => {
  const salida = [];
  const pila = [];
  let anterior = null;

  const desapilar = (prec, derecha) => {
    while (pila.length > 0) {
      const tope = pila[pila.length - 1];
      if (tope.tipo !== 'operador') break;
      const info = OPERADORES[tope.valor];
      if (info.prec > prec || (info.prec === prec && !derecha)) {
        salida.push(pila.pop());
      } else {
        break;
      }
    }
  };

  for (const tok of tokens) {
    if (tok.tipo === 'numero' || tok.tipo === 'postfijo') {
      salida.push(tok);
      anterior = tok;
      continue;
    }

    if (tok.tipo === 'funcion') {
      pila.push(tok);
      anterior = tok;
      continue;
    }

    if (tok.tipo === 'operador') {
      const esUnario = tok.valor === '-' && (
        anterior === null ||
        anterior.tipo === 'operador' ||
        (anterior.tipo === 'parentesis' && anterior.valor === '(')
      );
      if (esUnario) {
        pila.push({ tipo: 'operador', valor: 'u-' });
      } else {
        const info = OPERADORES[tok.valor];
        desapilar(info.prec, info.derecha);
        pila.push({ tipo: 'operador', valor: tok.valor });
      }
      anterior = tok;
      continue;
    }

    if (tok.tipo === 'parentesis' && tok.valor === '(') {
      pila.push(tok);
      anterior = tok;
      continue;
    }

    if (tok.tipo === 'parentesis' && tok.valor === ')') {
      let abierto = false;
      while (pila.length > 0) {
        const tope = pila.pop();
        if (tope.tipo === 'parentesis' && tope.valor === '(') {
          abierto = true;
          break;
        }
        salida.push(tope);
      }
      if (!abierto) throw new Error('Paréntesis desbalanceados');
      if (pila.length > 0 && pila[pila.length - 1].tipo === 'funcion') {
        salida.push(pila.pop());
      }
      anterior = tok;
      continue;
    }
  }

  while (pila.length > 0) {
    const tope = pila.pop();
    if (tope.tipo === 'parentesis') throw new Error('Paréntesis desbalanceados');
    salida.push(tope);
  }

  return salida;
};

const aplicarFuncion = (nombre, x, grados) => {
  const rad = grados ? (x * Math.PI) / 180 : x;
  switch (nombre) {
    case 'sin': return limpiarTrigonometrica(Math.sin(rad));
    case 'cos': return limpiarTrigonometrica(Math.cos(rad));
    case 'tan': return limpiarTrigonometrica(Math.tan(rad));
    case 'ln': return Math.log(x);
    case 'log': return Math.log10(x);
    case '√': return Math.sqrt(x);
    default: throw new Error('Función desconocida');
  }
};

const evaluarRPN = (rpn, grados) => {
  const pila = [];
  const pop = () => {
    if (pila.length === 0) throw new Error('Expresión inválida');
    return pila.pop();
  };

  for (let i = 0; i < rpn.length; i += 1) {
    const tok = rpn[i];

    if (tok.tipo === 'numero') {
      pila.push(tok.valor);
      continue;
    }

    if (tok.tipo === 'operador') {
      if (tok.valor === 'u-') {
        pila.push(-pop());
        continue;
      }
      const b = pop();
      const a = pop();
      if (tok.valor === '+') pila.push(a + b);
      else if (tok.valor === '-') pila.push(a - b);
      else if (tok.valor === '*') pila.push(a * b);
      else if (tok.valor === '/') pila.push(a / b);
      else if (tok.valor === '^') pila.push(a ** b);
      else throw new Error('Operador desconocido');
      continue;
    }

    if (tok.tipo === 'funcion') {
      pila.push(aplicarFuncion(tok.valor, pop(), grados));
      continue;
    }

    if (tok.tipo === 'postfijo') {
      if (tok.valor === '!') {
        pila.push(factorial(pop()));
        continue;
      }
      const b = pop();
      const siguiente = rpn[i + 1];
      const esSumaResta = siguiente && siguiente.tipo === 'operador' && (siguiente.valor === '+' || siguiente.valor === '-');
      if (esSumaResta && pila.length > 0) {
        const a = pila[pila.length - 1];
        pila.push((a * b) / 100);
      } else {
        pila.push(b / 100);
      }
      continue;
    }

    throw new Error('Token inválido');
  }

  if (pila.length !== 1) throw new Error('Expresión inválida');
  return pila[0];
};

export const evaluarExpresion = (expresion, { grados = true } = {}) => {
  const tokens = tokenizar(expresion);
  if (tokens.length === 0) throw new Error('Expresión vacía');
  const resultado = evaluarRPN(aRPN(tokens), grados);
  if (!Number.isFinite(resultado)) throw new Error('Resultado inválido');
  return Number(resultado.toPrecision(12));
};

const CONTINUA_NUMERO = /[0-9.]$/;
const TERMINA_OPERANDO = /[0-9.)πe!%.]$/;
const EMPIEZA_OPERANDO = /^[0-9.(π]|^e$/;
const ENTRADAS_FUNCION = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√('];

export const unirEntrada = (base, valor) => {
  const esNumero = /^[0-9.]$/.test(valor);

  if (esNumero && CONTINUA_NUMERO.test(base)) {
    if (valor === '.') {
      const ultimo = base.match(/(\d*\.?\d*)$/)?.[0] ?? '';
      if (ultimo.includes('.')) return base;
    }
    return base + valor;
  }

  const empiezaOperando = EMPIEZA_OPERANDO.test(valor) || ENTRADAS_FUNCION.includes(valor);
  if (TERMINA_OPERANDO.test(base) && empiezaOperando) return `${base}×${valor}`;
  return base + valor;
};
