export const esErrorTransitorio = (error) =>
  Boolean(
    error?.code === 112
    || error?.codeName === 'WriteConflict'
    || error?.hasErrorLabel?.('TransientTransactionError')
    || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
  );

export const conReintentos = async (fn, { intentos = 3, esperaMs = 40 } = {}) => {
  let ultimoError;
  for (let i = 0; i < intentos; i += 1) {
    try {
      return await fn();
    } catch (error) {
      ultimoError = error;
      if (!esErrorTransitorio(error) || i === intentos - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, esperaMs * (i + 1)));
    }
  }
  throw ultimoError;
};
