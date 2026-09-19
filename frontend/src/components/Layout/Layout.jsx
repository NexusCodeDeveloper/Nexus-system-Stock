import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileNav from './MobileNav';
import NewNotificationAlert from '../alerts/NewNotificationAlert';
import CartPanel from '../Cart/CartPanel';
import { IconCart } from '../ui/icons';
import { NotificationProvider } from '../../context/NotificationContext';
import { CajaProvider } from '../../context/CajaContext';
import { CartProvider, useCart } from '../../context/CartContext';

const LayoutInner = () => {
  const { cart, openCart } = useCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const conCarrito = cart.length > 0;

  const abrirCarritoMobile = () => {
    openCart();
    if (pathname !== '/products') navigate('/products');
  };

  return (
    <div className="flex h-screen bg-ios-bg overflow-x-hidden">
      <div className="hidden md:block shrink-0 relative w-[72px]">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-28 md:px-6 md:pb-6">
          <div className="max-w-7xl mx-auto animate-ios-page">
            <Outlet />
          </div>
        </main>
      </div>
      {conCarrito && (
        <div className="hidden md:block shrink-0 w-[320px]">
          <CartPanel />
        </div>
      )}
      {conCarrito && (
        <button
          type="button"
          onClick={abrirCarritoMobile}
          className="md:hidden fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-ios-tint text-white px-4 py-3 shadow-[0_8px_24px_rgba(10,132,255,0.45)] font-semibold text-sm"
          aria-label={`Abrir carrito (${cart.length} productos)`}
        >
          <IconCart className="w-4 h-4" />
          {cart.length}
        </button>
      )}
      <MobileNav />
      <NewNotificationAlert />
    </div>
  );
};

const Layout = () => (
  <NotificationProvider>
    <CajaProvider>
      <CartProvider>
        <LayoutInner />
      </CartProvider>
    </CajaProvider>
  </NotificationProvider>
);

export default Layout;
