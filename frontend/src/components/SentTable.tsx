'use client';

import { useSentJobs } from '@/hooks/useEmailJobs';
import { StatusChip } from './StatusChip';
import { Button } from './Button';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

interface SentTableProps {
  onCompose: () => void;
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function SentTable({ onCompose }: SentTableProps) {
  const { jobs, total, page, totalPages, loading, error, setPage, refetch } = useSentJobs(20);

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
        title="No emails sent yet"
        description="Once your scheduled emails are processed and sent, they'll appear here."
        icon={
          <svg className="w-16 h-16 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        action={
          <Button onClick={onCompose} id="sent-empty-compose-btn">
            Schedule Your First Email
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
          <span className="text-text-primary font-medium">{total}</span> sent emails
        </p>
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
                Sent At
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
                title={job.lastError ?? undefined}
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
                    {formatDateTime(job.sentAt)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <StatusChip status={job.status} />
                    {job.status === 'FAILED' && job.lastError && (
                      <span
                        className="text-xs text-error/70 truncate max-w-[180px]"
                        title={job.lastError}
                      >
                        {job.lastError}
                      </span>
                    )}
                  </div>
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
