'use client';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const DefaultIcon = () => (
  <svg
    className="w-16 h-16 text-text-muted"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
      {/* Icon with glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 blur-xl bg-primary/10 rounded-full scale-150" />
        <div className="relative p-5 rounded-2xl bg-elevated border border-white/7">
          {icon ?? <DefaultIcon />}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}
