import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileNav from './MobileNav';
import NewNotificationAlert from '../alerts/NewNotificationAlert';
import { NotificationProvider } from '../../context/NotificationContext';

const Layout = () => {
  return (
    <NotificationProvider>
      <div className="flex h-screen bg-ios-bg overflow-x-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />
          <main className="flex-1 overflow-y-auto px-4 pt-4 pb-28 md:px-6 md:pb-6">
            <div className="max-w-7xl mx-auto animate-ios-page">
              <Outlet />
            </div>
          </main>
        </div>
        <MobileNav />
        <NewNotificationAlert />
      </div>
    </NotificationProvider>
  );
};

export default Layout;