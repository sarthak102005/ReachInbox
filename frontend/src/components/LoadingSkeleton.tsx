'use client';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5">
      <div className="h-4 w-48 rounded shimmer" />
      <div className="h-4 w-64 rounded shimmer flex-1" />
      <div className="h-4 w-32 rounded shimmer" />
      <div className="h-6 w-24 rounded-full shimmer" />
    </div>
  );
}

export function LoadingSkeleton({ rows = 5, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`animate-fade-in ${className}`} aria-label="Loading...">
      {/* Table header skeleton */}
      <div className="flex items-center gap-4 px-6 py-3 bg-elevated/50 border-b border-white/7">
        <div className="h-3 w-32 rounded shimmer" />
        <div className="h-3 w-48 rounded shimmer flex-1" />
        <div className="h-3 w-28 rounded shimmer" />
        <div className="h-3 w-20 rounded shimmer" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`glass-card p-6 ${className}`} aria-label="Loading...">
      <div className="space-y-3">
        <div className="h-5 w-40 rounded shimmer" />
        <div className="h-4 w-full rounded shimmer" />
        <div className="h-4 w-3/4 rounded shimmer" />
      </div>
    </div>
  );
}
