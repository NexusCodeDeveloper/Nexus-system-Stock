import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import Layout from './components/Layout/Layout'
import LoginModal from './pages/Login/Login'
import Products from './pages/Products/Products'
import Suppliers from './pages/Suppliers/Suppliers'
import Returns from './pages/Returns/Returns'
import Sales from './pages/Sales/Sales'
import Tickets from './pages/Tickets/Tickets'
import Notifications from './pages/Notifications/Notifications'
import LoadingSpinner from './components/common/LoadingSpinner'
import WelcomeOverlay from './components/Layout/WelcomeOverlay'
import RoleGuideOverlay from './components/Layout/RoleGuideOverlay'
import PushPermissionBanner from './components/PushPermissionBanner'

function App() {
  const { user, loading } = useAuth()

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
              <Layout key={user ? 'auth' : 'guest'} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Products />} />
          <Route path="products" element={<Products />} />
          <Route path="sales" element={<Sales />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="returns" element={<Returns />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!user && <LoginModal />}
      {user && <WelcomeOverlay />}
      {user && <RoleGuideOverlay />}
      {user && <PushPermissionBanner />}
    </>
  )
}

export default App
