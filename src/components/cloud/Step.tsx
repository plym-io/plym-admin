import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

export type StepState = 'done' | 'active' | 'upcoming';

/**
 * One stage of a linear setup flow.
 *
 * Connecting a domain is four decisions, and showing all four at once is what
 * made this screen intimidating. So only the stage you are on is open: finished
 * stages collapse to the answer you gave with a way back to it, and stages you
 * haven't reached are named but empty — visible enough to show how much is
 * left, quiet enough to ignore.
 */
export function Step({
  index,
  title,
  hint,
  state,
  summary,
  onReopen,
  children,
}: {
  index: number;
  title: string;
  /** Shown under the title while the step is open. */
  hint?: React.ReactNode;
  state: StepState;
  /** The answer, shown in place of the body once the step is done. */
  summary?: React.ReactNode;
  onReopen?: () => void;
  children?: React.ReactNode;
}) {
  const done = state === 'done';
  const active = state === 'active';

  return (
    <section
      className={cn(
        'relative pl-10',
        // The rail joining the markers. It stops at the last step because the
        // element after it has no marker to reach.
        'after:absolute after:left-[13px] after:top-8 after:bottom-0 after:w-px after:bg-border',
        'last:after:hidden',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0.5 flex h-[27px] w-[27px] items-center justify-center rounded-full border text-[12px] font-medium tnum transition-colors',
          done && 'border-success/40 bg-success/10 text-success',
          active && 'border-accent bg-accent text-accent-fg',
          state === 'upcoming' && 'border-border text-fg-subtle',
        )}
      >
        {done ? <Check size={14} weight="bold" /> : index}
      </span>

      <div className={cn('pb-8', state === 'upcoming' && 'opacity-45')}>
        <div className="flex min-h-[27px] items-center justify-between gap-3">
          <h2
            className={cn(
              'text-[15px] font-semibold tracking-tight',
              active ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {title}
          </h2>
          {done && onReopen && (
            <button
              type="button"
              onClick={onReopen}
              className="shrink-0 text-[13px] text-fg-subtle underline-offset-2 transition-colors hover:text-fg hover:underline"
            >
              Change
            </button>
          )}
        </div>

        {done && summary ? (
          <div className="mt-1 text-[13.5px] text-fg-muted">{summary}</div>
        ) : active ? (
          <>
            {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
            {children && <div className="mt-4">{children}</div>}
          </>
        ) : null}
      </div>
    </section>
  );
}
