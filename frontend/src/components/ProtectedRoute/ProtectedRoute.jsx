import { Navigate } from 'react-router-dom';
import { useAutenticacion } from '../../context/autenticacionContexto';

const ProtectedRoute = ({ children, soloAdmin }) => {
  const { usuario, loading, esAdmin } = useAutenticacion();

  if (loading || !usuario) {
    return null;
  }

  if (soloAdmin && !esAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
