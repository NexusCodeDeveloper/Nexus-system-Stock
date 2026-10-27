import { describe, expect, it } from 'vitest';
import {
  LIMITES,
  limitarTexto,
  validarEmail,
  validarEntero,
  validarMonto,
  validarTexto,
} from '../src/utils/validacion';

describe('limitarTexto', () => {
  it('corta el texto al máximo indicado', () => {
    expect(limitarTexto('a'.repeat(10000), LIMITES.claveLogin.max)).toHaveLength(LIMITES.claveLogin.max);
  });

  it('no modifica textos dentro del límite', () => {
    expect(limitarTexto('corta', 10)).toBe('corta');
  });

  it('tolera null y undefined', () => {
    expect(limitarTexto(null, 5)).toBe('');
    expect(limitarTexto(undefined, 5)).toBe('');
  });
});

describe('validarTexto', () => {
  it('exige los campos con mínimo mayor a cero', () => {
    expect(validarTexto('   ', LIMITES.motivo, 'El motivo')).toBe('El motivo es obligatorio');
  });

  it('rechaza textos más largos que el máximo', () => {
    expect(validarTexto('a'.repeat(73), LIMITES.clave, 'La contraseña')).toContain('72');
  });
});

describe('validarEmail', () => {
  it('rechaza emails inválidos y acepta válidos', () => {
    expect(validarEmail('no-es-email')).toBe('Email inválido');
    expect(validarEmail('usuario@ejemplo.com')).toBe('');
  });
});

describe('validarMonto y validarEntero', () => {
  it('valida el rango de montos', () => {
    expect(validarMonto('0')).toContain('0.01');
    expect(validarMonto('100')).toBe('');
    expect(validarMonto('99999999')).toContain('9999999.99');
  });

  it('valida cantidades enteras dentro del rango', () => {
    expect(validarEntero('0')).toContain('1');
    expect(validarEntero('1.5')).toContain('entero');
    expect(validarEntero('10')).toBe('');
  });
});
