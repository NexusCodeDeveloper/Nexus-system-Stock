import { describe, expect, it } from 'vitest';
import { evaluarExpresion, unirEntrada } from './calculadora';

const evaluar = (expresion, grados = true) => evaluarExpresion(expresion, { grados });

describe('evaluarExpresion', () => {
  it('respeta la precedencia', () => {
    expect(evaluar('2+3×4')).toBe(14);
    expect(evaluar('2+3*4')).toBe(14);
    expect(evaluar('10-4÷2')).toBe(8);
  });

  it('evalúa paréntesis y potencias', () => {
    expect(evaluar('(2+3)×4')).toBe(20);
    expect(evaluar('2^3^2')).toBe(512);
    expect(evaluar('-2^2')).toBe(-4);
    expect(evaluar('2^-2')).toBe(0.25);
    expect(evaluar('2--3')).toBe(5);
  });

  it('evita errores de punto flotante', () => {
    expect(evaluar('0.1+0.2')).toBe(0.3);
    expect(evaluar('1÷3')).toBe(0.333333333333);
  });

  it('calcula porcentajes contextuales', () => {
    expect(evaluar('50%')).toBe(0.5);
    expect(evaluar('200-10%')).toBe(180);
    expect(evaluar('200+10%')).toBe(220);
    expect(evaluar('200×10%')).toBe(20);
    expect(evaluar('200÷10%')).toBe(2000);
  });

  it('calcula factoriales', () => {
    expect(evaluar('5!')).toBe(120);
    expect(evaluar('0!')).toBe(1);
    expect(evaluar('3!+2')).toBe(8);
  });

  it('aplica funciones científicas', () => {
    expect(evaluar('√(9)')).toBe(3);
    expect(evaluar('ln(e)')).toBe(1);
    expect(evaluar('log(1000)')).toBe(3);
    expect(evaluar('sin(30)')).toBe(0.5);
    expect(evaluar('cos(60)')).toBe(0.5);
    expect(evaluar('π')).toBeCloseTo(Math.PI, 10);
  });

  it('respeta el modo radianes', () => {
    expect(evaluar('sin(π÷2)', false)).toBe(1);
    expect(evaluar('cos(0)', false)).toBe(1);
  });

  it('rechaza expresiones inválidas', () => {
    expect(() => evaluar('2+')).toThrow();
    expect(() => evaluar('(2+3')).toThrow();
    expect(() => evaluar('5÷0')).toThrow();
    expect(() => evaluar('(-1)!')).toThrow();
    expect(() => evaluar('2.5!')).toThrow();
    expect(() => evaluar('√(-1)')).toThrow();
    expect(() => evaluar('2ab')).toThrow();
  });

  it('acepta números con punto final', () => {
    expect(evaluar('2.')).toBe(2);
    expect(evaluar('2.×π')).toBeCloseTo(2 * Math.PI, 10);
  });
});

describe('unirEntrada', () => {
  it('concatena dígitos sin multiplicar', () => {
    expect(unirEntrada('2', '3')).toBe('23');
    expect(unirEntrada('', '7')).toBe('7');
    expect(unirEntrada('2+', '3')).toBe('2+3');
    expect(unirEntrada('23', '9')).toBe('239');
  });

  it('maneja el punto decimal', () => {
    expect(unirEntrada('2', '.')).toBe('2.');
    expect(unirEntrada('2.', '5')).toBe('2.5');
    expect(unirEntrada('2.', '.')).toBe('2.');
  });

  it('multiplica solo cuando empieza un operando nuevo', () => {
    expect(unirEntrada('2', 'π')).toBe('2×π');
    expect(unirEntrada('2', 'sin(')).toBe('2×sin(');
    expect(unirEntrada(')', '3')).toBe(')×3');
    expect(unirEntrada('5!', '2')).toBe('5!×2');
    expect(unirEntrada('(2+3)', '(')).toBe('(2+3)×(');
    expect(unirEntrada('π', '2')).toBe('π×2');
  });
});
