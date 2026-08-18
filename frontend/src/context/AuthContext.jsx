import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const DEMO_USER = {
  _id: '000000000000000000000001',
  nombre: 'Admin Demo',
  email: 'admin@nexus.com',
  rol: 'admin',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(DEMO_USER);

  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  useEffect(() => {
    const handleUnauthorized = () => clearSession();
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  const login = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    window.location.reload();
  };

  const logout = () => {
    clearSession();
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, loading: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
