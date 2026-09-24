import { describe, expect, it } from 'vitest';
import { formatMoney, formatDateShort } from './format';

describe('formatMoney', () => {
  it('formatea montos con dos decimales y separador es-AR', () => {
    expect(formatMoney(1234.5)).toBe('$1.234,50');
    expect(formatMoney(0)).toBe('$0,00');
    expect(formatMoney(null)).toBe('$0,00');
    expect(formatMoney('no-numero')).toBe('$0,00');
  });
});

describe('formatDateShort', () => {
  it('no corre la fecha de los strings YYYY-MM-DD puros', () => {
    expect(formatDateShort('2026-09-24')).toBe('24/09/2026');
  });

  it('convierte ISO con hora a la fecha local', () => {
    expect(formatDateShort('2026-09-24T03:00:00.000Z')).toBe('24/09/2026');
  });

  it('devuelve — con una fecha inválida', () => {
    expect(formatDateShort('no-es-fecha')).toBe('—');
  });
});
