import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/20" />
      </div>
    );
  }

  return (
    <div className={!user ? 'opacity-70 pointer-events-none select-none' : ''}>
      {children}
    </div>
  );
};

export default ProtectedRoute;
