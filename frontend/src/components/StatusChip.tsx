'use client';

import type { EmailJobStatus } from '@/lib/types';

interface StatusChipProps {
  status: EmailJobStatus;
  className?: string;
}

const statusConfig: Record<
  EmailJobStatus,
  { label: string; classes: string; dot: string }
> = {
  SCHEDULED: {
    label: 'Scheduled',
    classes: 'bg-info/10 text-info border-info/20',
    dot: 'bg-info',
  },
  SENDING: {
    label: 'Sending',
    classes: 'bg-primary/10 text-primary-light border-primary/20',
    dot: 'bg-primary animate-pulse',
  },
  SENT: {
    label: 'Sent',
    classes: 'bg-success/10 text-success border-success/20',
    dot: 'bg-success',
  },
  FAILED: {
    label: 'Failed',
    classes: 'bg-error/10 text-error border-error/20',
    dot: 'bg-error',
  },
  RESCHEDULED: {
    label: 'Rescheduled',
    classes: 'bg-warning/10 text-warning border-warning/20',
    dot: 'bg-warning',
  },
};

export function StatusChip({ status, className = '' }: StatusChipProps) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: 'bg-white/5 text-text-secondary border-white/10',
    dot: 'bg-text-muted',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border
        ${config.classes} ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}
