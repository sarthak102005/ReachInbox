'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if token was provided in URL (cross-domain OAuth redirect from Render to Vercel)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
          localStorage.setItem('reachinbox_token', urlToken);
          // Set first-party cookie on Vercel domain as well
          document.cookie = `session=${urlToken}; path=/; max-age=604800; SameSite=Lax`;
          // Clean token from address bar
          params.delete('token');
          const cleanQuery = params.toString() ? `?${params.toString()}` : '';
          window.history.replaceState({}, '', `${window.location.pathname}${cleanQuery}`);
        }
      }

      const { user: u } = await api.auth.me();
      setUser(u);
    } catch {
      setUser(null);
      // Don't set error on initial 401 — it just means not logged in
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('reachinbox_token');
      document.cookie = 'session=; path=/; max-age=0';
    }
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setUser(null);
    window.location.href = '/login';
  }, []);

  return { user, loading, error, logout, refetch: fetchUser };
}
