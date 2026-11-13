export const MIN_LARGO = 6;
export const MAX_LARGO = 128;
export const MAX_INTERVALO_MS = 50;
export const MAX_INTERVALO_MAQUINA_MS = 35;

export const crearDetectorEscaneo = ({ ahora = () => Date.now() } = {}) => {
  let buffer = '';
  let ultimaTecla = 0;
  let lento = false;

  const reiniciar = () => {
    buffer = '';
    lento = false;
  };

  const procesarTecla = (evento = {}) => {
    if (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey || evento.isComposing) {
      return null;
    }

    const instante = ahora();

    if (evento.key === 'Enter') {
      const codigo = buffer;
      const esMaquina = !lento;
      reiniciar();
      if (!esMaquina || codigo.length < MIN_LARGO) return null;
      return codigo;
    }

    if (evento.key === 'Backspace' || evento.key === 'Delete' || evento.key === 'Tab' || evento.key === 'Escape') {
      reiniciar();
      return null;
    }

    if (typeof evento.key !== 'string' || evento.key.length !== 1) return null;

    const delta = instante - ultimaTecla;
    ultimaTecla = instante;

    if (delta > MAX_INTERVALO_MS) {
      reiniciar();
    } else if (delta > MAX_INTERVALO_MAQUINA_MS) {
      lento = true;
    }

    buffer += evento.key;
    if (buffer.length > MAX_LARGO) {
      buffer = buffer.slice(-MAX_LARGO);
    }
    return null;
  };

  return { procesarTecla, reiniciar };
};
