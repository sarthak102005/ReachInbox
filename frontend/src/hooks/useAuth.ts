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
    await api.auth.logout();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return { user, loading, error, logout, refetch: fetchUser };
}
