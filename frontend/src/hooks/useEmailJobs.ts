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

  const fetchJobs = useCallback(async (p: number, isPolling = false) => {
    if (!isPolling) {
      setLoading(true);
    }
    try {
      const result = type === 'scheduled'
        ? await api.emails.scheduled(p, limit)
        : await api.emails.sent(p, limit);
      setData(result);
      setError(null);
    } catch (err: any) {
      if (!isPolling) {
        setError(err.message);
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, [type, limit]);

  // Auto-refresh every 5s when there are SCHEDULED/SENDING jobs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    fetchJobs(page, false);

    if (type === 'scheduled') {
      intervalRef.current = setInterval(() => fetchJobs(page, true), 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchJobs, page, type]);

  return {
    jobs: data.jobs,
    total: data.total,
    page: data.page,
    totalPages: data.totalPages,
    loading,
    error,
    setPage: (p: number) => setPage(p),
    refetch: () => fetchJobs(page, false),
  };
}

export function useScheduledJobs(limit?: number) {
  return useEmailJobs('scheduled', limit);
}

export function useSentJobs(limit?: number) {
  return useEmailJobs('sent', limit);
}
