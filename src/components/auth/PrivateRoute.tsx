import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { authState } = useAuth();

  if (authState === 'loading') {
    return <div className="flex items-center justify-center h-screen"><div className="animate-pulse text-muted-foreground/70">Loading...</div></div>;
  }
  if (authState === 'unauthenticated') return <Navigate to="/sign-in" replace />;
  if (authState === 'unverified') return <Navigate to="/verify-email" replace />;

  return <>{children}</>;
}
