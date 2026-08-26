import { motion } from 'motion/react';
import type { PostStatus } from '@/types';
import { STATUS_META } from '@/components/ui/status';
import { cn } from '@/lib/classnames';

const ORDER: PostStatus[] = ['draft', 'published', 'archived'];

interface Props {
  status: PostStatus;
  pending?: boolean;
  onChange: (status: PostStatus) => void;
}

/** Three radio-style status pills. Click flips immediately (optimistic). */
export function StatusPills({ status, pending, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Status
      </label>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Status">
        {ORDER.map((s) => {
          const active = s === status;
          const meta = STATUS_META[s];
          return (
            <button
              key={s}
              role="radio"
              aria-checked={active}
              disabled={pending && active}
              onClick={() => !active && onChange(s)}
              className={cn(
                'relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'text-fg'
                  : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
              )}
            >
              {active && (
                <motion.span
                  layoutId="status-active"
                  className="absolute inset-0 -z-10 rounded-md bg-accent-soft"
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full ring-2 ring-transparent transition-all',
                  active ? meta.dot : 'border border-border-strong',
                  pending && active && 'animate-pulse',
                )}
              />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
