import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Menu, Settings, X } from 'lucide-react';

export function Navbar() {
  const { teacher, isAdmin } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const onScroll = useCallback(() => {
    setScrolled(window.scrollY > 10);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin/models' }] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  const initials = teacher?.displayName
    ? teacher.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : teacher?.email?.[0]?.toUpperCase() || '?';

  return (
    <>
      <nav
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-lg border-b border-border shadow-[--shadow-sm]'
            : 'bg-background border-b border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/dashboard" className="font-heading text-xl font-bold text-primary tracking-tight">
            ClassPulse
          </Link>

          {/* Desktop nav — segmented tabs */}
          <div data-tour="nav-tabs" className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-full p-1">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                  isActive(item.path)
                    ? 'bg-card text-foreground shadow-[--shadow-xs]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Desktop user area */}
          <div className="hidden sm:flex items-center gap-3">
            <Link to="/settings" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              {teacher?.photoURL ? (
                <img src={teacher.photoURL} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
              )}
              <span className="text-sm text-muted-foreground max-w-[140px] truncate">
                {teacher?.displayName || teacher?.email}
              </span>
            </Link>
            <div className="w-px h-5 bg-border" />
            <Link
              to="/settings"
              data-tour="settings-gear"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-[--radius-md] transition-colors"
              title="Settings" aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <button
              onClick={() => signOut(auth)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-[--radius-md] transition-colors"
              title="Sign out" aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden p-2 text-muted-foreground hover:text-foreground rounded-[--radius-md] transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-40 bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-lg sm:hidden">
          <div className="flex flex-col h-full p-4">
            <div className="flex flex-col gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-3 text-sm font-medium rounded-[--radius-md] transition-colors ${
                    isActive(item.path)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mt-auto pt-4 border-t border-border">
              <div className="flex items-center gap-3 px-4 py-3">
                {teacher?.photoURL ? (
                  <img src={teacher.photoURL} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{teacher?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{teacher?.email}</p>
                </div>
              </div>
              <Link
                to="/settings"
                className="w-full mt-1 flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-[--radius-md] transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <button
                onClick={() => signOut(auth)}
                className="w-full mt-1 flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-[--radius-md] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
