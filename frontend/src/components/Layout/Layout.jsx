import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileNav from './MobileNav';
import NewNotificationAlert from '../alerts/NewNotificationAlert';
import CartPanel from '../Cart/CartPanel';
import { NotificationProvider } from '../../context/NotificationContext';
import { CartProvider, useCart } from '../../context/CartContext';

const LayoutInner = () => {
  const { cart } = useCart();
  const conCarrito = cart.length > 0;

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
      <MobileNav />
      <NewNotificationAlert />
    </div>
  );
};

const Layout = () => (
  <NotificationProvider>
    <CartProvider>
      <LayoutInner />
    </CartProvider>
  </NotificationProvider>
);

export default Layout;
