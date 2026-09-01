import { Skeleton, SkeletonText } from './Skeleton';

export function SkeletonStatCards({ count = 4, cols = 'grid-cols-2 sm:grid-cols-4' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flat-card-static p-4">
          <Skeleton className="w-9 h-9 rounded-xl mb-2.5" />
          <Skeleton className="h-6 w-16 mb-1.5" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flat-card p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-surface-200">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="overflow-x-auto">
        <div className="w-full">
          <div className="flex items-center gap-6 px-3 py-3 border-b border-surface-200 bg-surface-50">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className={`h-3.5 ${i === 0 ? 'w-32' : 'w-20'}`} />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-6 px-3 py-3.5 border-b border-surface-100">
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-32' : 'w-16'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <Skeleton className="h-7 w-44 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-28 rounded-xl" />
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flat-card">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4 w-36" />
          </div>
          <SkeletonText lines={3} />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-surface-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-6 h-6 rounded-lg shrink-0" />
          <Skeleton className="h-3.5 w-32 shrink-0" />
          <Skeleton className="h-3 w-20 shrink-0" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
