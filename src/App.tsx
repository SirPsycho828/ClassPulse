import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { PublicRoute } from '@/components/auth/PublicRoute';
import { PrivateRoute } from '@/components/auth/PrivateRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import { AppLayout } from '@/components/layout/AppLayout';

import Landing from '@/pages/Landing';
import SignIn from '@/pages/SignIn';
import SignUp from '@/pages/SignUp';
import VerifyEmail from '@/pages/VerifyEmail';
import Dashboard from '@/pages/Dashboard';
import SetupWizard from '@/pages/SetupWizard';
import Upload from '@/pages/Upload';
import ReviewConfirm from '@/pages/ReviewConfirm';
import ClassOverview from '@/pages/ClassOverview';
import StudentDetail from '@/pages/StudentDetail';
import InterventionPlanner from '@/pages/InterventionPlanner';
import AdminModels from '@/pages/AdminModels';
import Settings from '@/pages/Settings';
import Onboarding from '@/pages/Onboarding';

function LandingRoute() {
  const { authState } = useAuth();
  if (authState === 'loading') return null;
  if (authState === 'authenticated') return <Navigate to="/dashboard" replace />;
  if (authState === 'unverified') return <Navigate to="/verify-email" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/sign-in" element={<PublicRoute><SignIn /></PublicRoute>} />
            <Route path="/sign-up" element={<PublicRoute><SignUp /></PublicRoute>} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Onboarding — protected but no AppLayout */}
            <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />

            {/* Protected routes */}
            <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/analysis/new" element={<SetupWizard />} />
              <Route path="/analysis/:id/upload" element={<Upload />} />
              <Route path="/analysis/:id/review" element={<ReviewConfirm />} />
              <Route path="/analysis/:id" element={<ClassOverview />} />
              <Route path="/analysis/:id/student/:studentId" element={<StudentDetail />} />
              <Route path="/analysis/:id/interventions" element={<InterventionPlanner />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Admin routes */}
            <Route element={<AdminRoute><AppLayout /></AdminRoute>}>
              <Route path="/admin/models" element={<AdminModels />} />
            </Route>

            {/* Landing page */}
            <Route path="/" element={<LandingRoute />} />

            {/* Default redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
