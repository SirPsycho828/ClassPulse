import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type AuthState = 'loading' | 'unauthenticated' | 'unverified' | 'authenticated';

interface TeacherProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  schoolName: string;
  schoolAddress: string;
  isAdmin: boolean;
  preferences: {
    confidenceThreshold: number;
    autoConfirmExact: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  teacher: TeacherProfile | null;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authState: 'loading',
  teacher: null,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);

  useEffect(() => {
    let unsubTeacher: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up previous Firestore listener before processing new auth state
      if (unsubTeacher) {
        unsubTeacher();
        unsubTeacher = null;
      }

      setUser(firebaseUser);
      if (!firebaseUser) {
        setAuthState('unauthenticated');
        setTeacher(null);
        return;
      }

      // Google provider users are always "verified"
      const isGoogleProvider = firebaseUser.providerData.some(
        (p) => p.providerId === 'google.com'
      );

      if (!firebaseUser.emailVerified && !isGoogleProvider) {
        setAuthState('unverified');
        setTeacher(null);
        return;
      }

      // Listen to teacher profile doc — create if missing
      const teacherRef = doc(db, 'teachers', firebaseUser.uid);
      unsubTeacher = onSnapshot(
        teacherRef,
        async (snap) => {
          if (snap.exists()) {
            setTeacher(snap.data() as TeacherProfile);
          } else {
            // Create teacher profile client-side (replaces server-side blocking trigger)
            try {
              await setDoc(teacherRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                photoURL: firebaseUser.photoURL || '',
                schoolName: '',
                schoolAddress: '',
                isAdmin: false,
                preferences: {
                  confidenceThreshold: 0.7,
                  autoConfirmExact: true,
                },
                createdAt: serverTimestamp(),
              });
            } catch {
              // Doc may already be created by a race — onSnapshot will pick it up
            }
          }
          setAuthState('authenticated');
        },
        () => {
          // Only set authenticated on error if user is still signed in
          if (auth.currentUser) {
            setAuthState('authenticated');
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubTeacher) unsubTeacher();
    };
  }, []);

  const isAdmin = teacher?.isAdmin ?? false;

  return (
    <AuthContext.Provider value={{ user, authState, teacher, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
