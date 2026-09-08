'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { PaginatedJobs, EmailJob } from '@/lib/types';

interface UseEmailJobsReturn {
  jobs: EmailJob[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  setPage: (p: number) => void;
  refetch: () => void;
}

function useEmailJobs(type: 'scheduled' | 'sent', limit = 20): UseEmailJobsReturn {
  const [data, setData] = useState<PaginatedJobs>({
    jobs: [],
    total: 0,
    page: 1,
    limit,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetch = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = type === 'scheduled'
        ? await api.emails.scheduled(p, limit)
        : await api.emails.sent(p, limit);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type, limit]);

  // Auto-refresh every 5s when there are SCHEDULED/SENDING jobs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    fetch(page);

    if (type === 'scheduled') {
      intervalRef.current = setInterval(() => fetch(page), 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch, page, type]);

  return {
    jobs: data.jobs,
    total: data.total,
    page: data.page,
    totalPages: data.totalPages,
    loading,
    error,
    setPage: (p: number) => setPage(p),
    refetch: () => fetch(page),
  };
}

export function useScheduledJobs(limit?: number) {
  return useEmailJobs('scheduled', limit);
}

export function useSentJobs(limit?: number) {
  return useEmailJobs('sent', limit);
}
