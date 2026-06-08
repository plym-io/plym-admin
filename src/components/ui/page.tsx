import { cn } from '@/lib/classnames';

/** Shared page chrome — title + optional description and right-side actions. */
export function PageHeader({
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
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-fg">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
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
        'mx-auto px-6 py-8 sm:px-8',
        width === 'text' && 'max-w-4xl',
        width === 'wide' && 'max-w-5xl',
        width === 'full' && 'max-w-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
