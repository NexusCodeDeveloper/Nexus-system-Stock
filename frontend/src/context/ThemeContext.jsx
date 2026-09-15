import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getItem, setItem } from '../utils/storage';

const ThemeContext = createContext(null);

const getInitialTheme = () => {
  return getItem('theme') === 'light' ? 'light' : 'dark';
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
};
