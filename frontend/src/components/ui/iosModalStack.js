const modalStack = [];

export const pushModal = (onClose) => {
  const entrada = { onClose };
  modalStack.push(entrada);
  return entrada;
};

export const popModal = (entrada) => {
  const idx = modalStack.indexOf(entrada);
  if (idx !== -1) modalStack.splice(idx, 1);
};

export const esTopModal = (entrada) => modalStack[modalStack.length - 1] === entrada;

export const modalStackVacio = () => modalStack.length === 0;
