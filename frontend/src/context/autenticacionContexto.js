import { createContext, useContext } from 'react';

export const AutenticacionContext = createContext(null);

export const useAutenticacion = () => useContext(AutenticacionContext);
