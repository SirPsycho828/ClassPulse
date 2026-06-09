import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { authState, isAdmin } = useAuth();

  if (authState === 'loading') {
    return <div className="flex items-center justify-center h-screen"><div className="animate-pulse text-muted-foreground/70">Loading...</div></div>;
  }
  if (authState !== 'authenticated') return <Navigate to="/sign-in" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
