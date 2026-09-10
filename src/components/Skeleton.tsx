export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between">
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <Skeleton className="mb-2 h-4 w-3/4" />
            <div className="mb-4 flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="mb-4 flex-1">
              <Skeleton className="mb-1.5 h-3 w-16" />
              <Skeleton className="h-1 w-full" />
              <Skeleton className="mt-3 h-3 w-14" />
            </div>
            <Skeleton className="h-4 w-24 border-t border-border pt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-3">
            <Skeleton className="mb-3 h-4 w-24" />
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
