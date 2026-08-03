import { cn } from '@/lib/classnames';

/**
 * A numbered procedure. Used wherever the panel can't do the thing for you and
 * has to say where to go instead — analytics scripts, connecting an MCP client.
 * The rail is drawn between the markers, so a step's body can be any height.
 */
export function Steps({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ol className={cn('relative space-y-4', className)}>{children}</ol>;
}

export function Step({
  n,
  title,
  children,
  className,
  /** The rail stops at the last marker rather than trailing into nothing. */
  last = false,
}: {
  n: number;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  last?: boolean;
}) {
  return (
    <li className={cn('relative flex gap-3.5', className)}>
      <div className="relative flex flex-col items-center">
        <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-bg-subtle text-[11.5px] font-semibold tabular-nums text-fg-muted">
          {n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-1')}>
        <p className="text-[13.5px] font-medium leading-6 text-fg">{title}</p>
        {children && <div className="mt-2 text-[13px] text-fg-muted">{children}</div>}
      </div>
    </li>
  );
}
