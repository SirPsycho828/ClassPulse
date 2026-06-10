import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { AnimatePresence, motion } from 'framer-motion';
import { TourProvider } from '@/components/ux/AppTour';

export function AppLayout() {
  const location = useLocation();

  // Stable key for analysis sub-routes: all tabs under /analysis/:id share one key
  // so the layout doesn't remount (and re-fetch) on tab switches
  const analysisMatch = location.pathname.match(/^(\/analysis\/[^/]+)/);
  const animationKey = analysisMatch ? analysisMatch[1] : location.pathname;

  return (
    <TourProvider>
    <div className="min-h-screen bg-background">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={animationKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
    </TourProvider>
  );
}
