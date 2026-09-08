'use client';

import { useEffect, useRef } from 'react';
import { useScheduledJobs } from '@/hooks/useEmailJobs';
import { StatusChip } from './StatusChip';
import { Button } from './Button';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

interface ScheduledTableProps {
  onCompose: () => void;
  searchQuery?: string;
  refreshTrigger?: number;
}

function formatDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function ScheduledTable({ onCompose, searchQuery, refreshTrigger }: ScheduledTableProps) {
  const { jobs, total, page, totalPages, loading, error, setPage, refetch } = useScheduledJobs(20);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      refetch();
    }
  }, [refreshTrigger]);

  if (loading && jobs.length === 0) {
    return <LoadingSkeleton rows={6} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-error text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={refetch}>Retry</Button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No scheduled emails"
        description="Schedule your first email campaign using the Compose button above."
        action={
          <Button onClick={onCompose} id="empty-state-compose-btn">
            Compose New Email
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header info */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/7">
        <p className="text-sm text-text-secondary">
          Showing <span className="text-text-primary font-medium">{jobs.length}</span> of{' '}
          <span className="text-text-primary font-medium">{total}</span> scheduled emails
        </p>
        <button
          onClick={refetch}
          className="text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/7 bg-elevated/40">
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-6 py-3">
                Recipient
              </th>
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-6 py-3">
                Subject
              </th>
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-6 py-3">
                Sender
              </th>
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-6 py-3">
                Scheduled For
              </th>
              <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider px-6 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-white/2 transition-colors group"
              >
                <td className="px-6 py-4">
                  <span className="text-sm text-text-primary font-medium truncate max-w-[200px] block">
                    {job.recipientEmail}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-text-secondary truncate max-w-[260px] block">
                    {job.subject}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-text-muted">
                    {job.sender?.displayName ?? '—'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-text-secondary tabular-nums">
                    {job.scheduledFor ? formatDateTime(job.scheduledFor) : '—'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <StatusChip status={job.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-white/7">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            ← Prev
          </Button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
