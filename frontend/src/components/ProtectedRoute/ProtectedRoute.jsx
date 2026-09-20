import { useAutenticacion } from '../../context/AutenticacionContext';

const ProtectedRoute = ({ children }) => {
  const { usuario, loading } = useAutenticacion();

  if (loading || !usuario) {
    return null;
  }

  return children;
};

export default ProtectedRoute;
