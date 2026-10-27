import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { currentUserRequest, loginRequest, logoutRequest } from './api';
import { AuthSession, AuthUser, UserRole } from './types';

const STORAGE_KEY = 'emak-auth-session';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storedSession(): AuthSession | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function rolePath(role: UserRole): string {
  if (role === 'Manager') return '/manager';
  if (role === 'Team Member') return '/team-member';
  return '/client';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(storedSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      return;
    }

    let active = true;
    currentUserRequest(session.token)
      .then((user) => {
        if (!active) return;
        const nextSession = { token: session.token, user };
        setSession(nextSession);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.token]);

  async function login(email: string, password: string) {
    const nextSession = await loginRequest(email, password);
    setSession(nextSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    return nextSession.user;
  }

  async function logout() {
    const token = session?.token;
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
    if (token) {
      try {
        await logoutRequest(token);
      } catch {
        return;
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        token: session?.token || null,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
