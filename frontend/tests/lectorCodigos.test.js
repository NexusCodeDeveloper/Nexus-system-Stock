import { describe, expect, it } from 'vitest';
import { crearDetectorEscaneo } from '../src/utils/lectorCodigos';

const crearReloj = () => {
  let instante = 0;
  return {
    avanzar: (ms) => {
      instante += ms;
    },
    ahora: () => instante,
  };
};

const tecla = (key, extra = {}) => ({ key, ...extra });

const escribir = (detector, reloj, texto, intervalo = 150) => {
  for (const caracter of texto) {
    reloj.avanzar(intervalo);
    detector.procesarTecla(tecla(caracter));
  }
};

const escanear = (detector, reloj, codigo, intervalo = 8) => {
  for (const caracter of codigo) {
    if (/[A-Z]/.test(caracter)) detector.procesarTecla(tecla('Shift'));
    reloj.avanzar(intervalo);
    detector.procesarTecla(tecla(caracter));
  }
  reloj.avanzar(intervalo);
  return detector.procesarTecla(tecla('Enter'));
};

describe('crearDetectorEscaneo', () => {
  it('no mezcla el texto tipeado antes con un código que empieza con mayúscula', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    escribir(detector, reloj, 'Tomas');
    reloj.avanzar(800);

    expect(escanear(detector, reloj, 'NC-000004-02')).toBe('NC-000004-02');
  });

  it('detecta un código desde el arranque sin texto previo', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    expect(escanear(detector, reloj, '7798062547559')).toBe('7798062547559');
  });

  it('soporta mayúsculas en el medio del código', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    expect(escanear(detector, reloj, 'AB-000123')).toBe('AB-000123');
  });

  it('no dispara con tecleo humano lento', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    escribir(detector, reloj, 'ABC123', 40);
    reloj.avanzar(40);
    expect(detector.procesarTecla(tecla('Enter'))).toBeNull();
  });

  it('descarta códigos demasiado cortos', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    expect(escanear(detector, reloj, '12345')).toBeNull();
  });

  it('limpia el buffer con Backspace o Escape', () => {
    const reloj = crearReloj();
    const detector = crearDetectorEscaneo({ ahora: reloj.ahora });

    escribir(detector, reloj, 'Tomas');
    detector.procesarTecla(tecla('Backspace'));
    reloj.avanzar(800);
    expect(escanear(detector, reloj, 'NC-000043-01')).toBe('NC-000043-01');

    escribir(detector, reloj, 'Tomas');
    detector.procesarTecla(tecla('Escape'));
    reloj.avanzar(800);
    expect(escanear(detector, reloj, 'NC-000004-02')).toBe('NC-000004-02');
  });
});
