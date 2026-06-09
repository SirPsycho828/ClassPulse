import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

export default function VerifyEmail() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleResend() {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setSent(true);
    } catch {
      setError('Could not resend verification email. Please try again later.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="font-heading text-2xl font-bold text-primary">ClassPulse</Link>

        <div className="mt-8 bg-card rounded-[--radius-lg] shadow-[--shadow-sm] border border-border p-8">
          {/* Mail icon */}
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>

          <h1 className="font-heading text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We sent a verification link to <strong className="text-foreground">{user?.email}</strong>. Click the link to verify your account.
          </p>

          {error && <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-[--radius-md]">{error}</div>}
          {sent && <div className="mt-4 p-3 bg-success/10 border border-success/20 text-success text-sm rounded-[--radius-md]">Verification email resent.</div>}

          <p className="mt-4 text-xs text-muted-foreground/70">
            Don't see the email? Check your spam or junk folder.
          </p>

          <button
            onClick={handleResend}
            className="mt-3 text-sm text-accent hover:text-accent/80 font-medium transition-colors"
          >
            Resend verification email
          </button>

          <div className="mt-6 pt-6 border-t border-border">
            <button
              onClick={() => signOut(auth)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out and use a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
