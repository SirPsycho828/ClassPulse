import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Please try again.');
      }
    }
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email first.'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch { setError('Could not send reset email.'); }
  }

  return (
    <div className="min-h-screen flex">
      {/* Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary overflow-hidden">
        <img
          src="/images/classroom.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <Link to="/" className="font-heading text-2xl font-bold">ClassPulse</Link>
          <div>
            <h2 className="font-heading text-4xl font-bold leading-tight">
              Every paper tells
              <br />
              a story.
            </h2>
            <p className="mt-4 text-primary-foreground/70 max-w-md leading-relaxed">
              Upload student work, get instant class-level analysis with skill breakdowns and targeted intervention plans.
            </p>
          </div>
          <p className="text-primary-foreground/40 text-sm">AI-powered classroom analysis for K-12 teachers</p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-4 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <Link to="/" className="font-heading text-2xl font-bold text-primary">ClassPulse</Link>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to your account</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="font-heading text-3xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground mt-1">Sign in to continue to your dashboard</p>
          </div>

          <div className="bg-card rounded-[--radius-lg] shadow-[--shadow-sm] border border-border p-6 sm:p-8">
            {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-[--radius-md]">{error}</div>}
            {resetSent && <div className="mb-4 p-3 bg-success/10 border border-success/20 text-success text-sm rounded-[--radius-md]">Check your email for a reset link.</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-wide uppercase">Email</label>
                <input
                  id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-background border border-input rounded-[--radius-md] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card transition-shadow"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-wide uppercase">Password</label>
                <input
                  id="password" type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-background border border-input rounded-[--radius-md] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card transition-shadow"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground py-2.5 px-4 rounded-full text-sm font-semibold tracking-wide hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <button onClick={handleForgotPassword} className="mt-3 text-sm text-accent hover:text-accent/80 w-full text-center transition-colors">
              Forgot password?
            </button>

            <div className="mt-5 relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground uppercase tracking-wider">or</span></div>
            </div>

            <button onClick={handleGoogle} className="mt-5 w-full flex items-center justify-center gap-2.5 border border-border rounded-full py-2.5 px-4 text-sm font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/sign-up" className="text-accent hover:text-accent/80 font-medium transition-colors">Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
