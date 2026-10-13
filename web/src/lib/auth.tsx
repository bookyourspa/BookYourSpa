'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from './api';

type AuthValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<{ user: User; supplierStatus?: string | null }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User | null }>('/api/auth/me');
      setUser(data.user);
    } catch (e) {
      setUser(null);
      if (e instanceof ApiError && e.code === 'network') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    const data = await api<{ user: User; supplierStatus?: string | null }>('/api/auth/register', { method: 'POST', body: payload });
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, loading, error, login, register, logout, refresh, setUser }), [user, loading, error, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Client-side route guard for the dashboard shells. */
export function useRoleGuard(role: 'admin' | 'supplier' | 'customer', loginPath = '/login') {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Never redirect when already on the login page itself — it would reload
      // forever (full-page location.replace on the current path = reload loop).
      const here = window.location.pathname.replace(/\/+$/, '') || '/';
      const loginNorm = loginPath.replace(/\/+$/, '') || '/';
      if (here !== loginNorm) {
        window.location.replace(`${loginPath}?next=${encodeURIComponent(here)}`);
      }
      return;
    }
    if (user.role !== role) {
      window.location.replace(user.role === 'admin' ? '/admin' : user.role === 'supplier' ? '/supplier' : '/login');
      return;
    }
    setAllowed(true);
  }, [user, loading, role, loginPath]);
  return { allowed, loading, user };
}
