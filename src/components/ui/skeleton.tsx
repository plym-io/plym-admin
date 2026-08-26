import { cn } from '@/lib/classnames';

/** Shape-matched loading placeholder — BRD §4: skeletons, not spinners. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-bg-muted',
        className,
      )}
    />
  );
}
