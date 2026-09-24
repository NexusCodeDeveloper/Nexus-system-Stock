import { Routes, Route, Navigate } from 'react-router-dom'
import { useAutenticacion } from './context/autenticacionContexto'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import Layout from './components/Layout/Layout'
import LoginModal from './pages/Login/Login'
import Productos from './pages/Productos/Productos'
import Deposito from './pages/Deposito/Deposito'
import Proveedores from './pages/Proveedores/Proveedores'
import Devoluciones from './pages/Devoluciones/Devoluciones'
import Ventas from './pages/Ventas/Ventas'
import Tickets from './pages/Tickets/Tickets'
import Notificaciones from './pages/Notificaciones/Notificaciones'
import Empleados from './pages/Empleados/Empleados'
import LoadingSpinner from './components/common/LoadingSpinner'
import WelcomeOverlay from './components/Layout/WelcomeOverlay'
import BannerPermisoPush from './components/BannerPermisoPush'

function Inicio() {
  return <Navigate to="/productos" replace />
}

function App() {
  const autenticacion = useAutenticacion()

  if (!autenticacion) {
    return (
      <div className="flex items-center justify-center h-screen bg-ios-bg px-6">
        <div className="text-center max-w-sm">
          <p className="text-ios-label font-semibold mb-2">La app se actualizó</p>
          <p className="text-ios-secondary text-sm mb-4">
            Recargá la página para seguir. Si el problema continúa, cerrá la app y volvé a abrirla.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-ios-pill bg-ios-tint text-white text-sm font-semibold"
          >
            Recargar página
          </button>
        </div>
      </div>
    )
  }

  const { usuario, loading } = autenticacion

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ios-bg">
        <LoadingSpinner size="h-10 w-10" />
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout key={usuario ? 'auth' : 'guest'} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Inicio />} />
          <Route path="productos" element={<Productos />} />
          <Route path="deposito" element={<Deposito />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="proveedores" element={<ProtectedRoute soloAdmin><Proveedores /></ProtectedRoute>} />
          <Route path="devoluciones" element={<Devoluciones />} />
          <Route path="notificaciones" element={<Notificaciones />} />
          <Route path="empleados" element={<ProtectedRoute soloAdmin><Empleados /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!usuario && <LoginModal />}
      {usuario && <WelcomeOverlay />}
      {usuario && <BannerPermisoPush />}
    </>
  )
}

export default App
