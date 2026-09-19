import { Routes, Route, Navigate } from 'react-router-dom'
import { useAutenticacion } from './context/AutenticacionContext'
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
import LoadingSpinner from './components/common/LoadingSpinner'
import WelcomeOverlay from './components/Layout/WelcomeOverlay'
import BannerPermisoPush from './components/BannerPermisoPush'

function App() {
  const { usuario, loading } = useAutenticacion()

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
          <Route index element={<Productos />} />
          <Route path="productos" element={<Productos />} />
          <Route path="deposito" element={<Deposito />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="devoluciones" element={<Devoluciones />} />
          <Route path="notificaciones" element={<Notificaciones />} />
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
