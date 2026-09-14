import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return null;
  }

  return children;
};

export default ProtectedRoute;
