import { cn } from '@/lib/classnames';

/**
 * The shared page furniture. Every screen is built from these four pieces —
 * a Page for the measure, a PageHeader for the title row, and Panels grouped
 * under Sections for the body — so a new screen inherits the dashboard's
 * spacing and elevation instead of inventing its own.
 */

export function PageHeader({
  title,
  description,
  actions,
  /** Small label above the title, for a page that belongs to something. */
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-6 gap-y-3',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-fg">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function Page({
  children,
  width = 'wide',
  className,
}: {
  children: React.ReactNode;
  width?: 'wide' | 'text' | 'full';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto px-6 py-7 sm:px-8',
        width === 'text' && 'max-w-4xl',
        width === 'wide' && 'max-w-6xl',
        width === 'full' && 'max-w-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A raised surface on the canvas. Everything that is a discrete block of the
 * dashboard — a table, a form group, a stat row — sits in one of these.
 */
export function Panel({
  children,
  className,
  /** Drop the padding when the panel's content manages its own (tables, lists). */
  flush = false,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg shadow-xs',
        !flush && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A panel's own title bar, above its content and inside its border. */
export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A labelled run of panels. The heading is the page's second level — quiet,
 * uppercase, never competing with the page title.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-[13px] text-fg-muted">{description}</p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rows inside a flush Panel — a divided list, the dashboard's table stand-in. */
export function PanelList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-border', className)}>{children}</div>
  );
}
