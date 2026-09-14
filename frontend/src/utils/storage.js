export const getItem = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setItem = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeItem = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage bloqueado */
  }
};
