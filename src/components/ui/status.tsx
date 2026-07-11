import type { PostStatus } from '@/types';
import { cn } from '@/lib/classnames';

export const STATUS_META: Record<
  PostStatus,
  { label: string; dot: string; strip: string }
> = {
  draft: {
    label: 'Draft',
    dot: 'bg-fg-subtle',
    strip: 'bg-border-strong',
  },
  published: {
    label: 'Published',
    dot: 'bg-accent',
    strip: 'bg-accent',
  },
  archived: {
    label: 'Archived',
    dot: 'bg-fg-subtle/40',
    strip: 'bg-border',
  },
};

/** Small status dot + label, used in rows and the editor rail. */
export function StatusDot({
  status,
  showLabel = false,
  className,
}: {
  status: PostStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} />
      {showLabel && (
        <span className="text-xs text-fg-muted">{meta.label}</span>
      )}
    </span>
  );
}
