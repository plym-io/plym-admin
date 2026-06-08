import { Skeleton } from '@/components/ui/skeleton';

/** Generic page-shaped skeleton for route-level Suspense (BRD §16). */
export function RouteFallback() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
