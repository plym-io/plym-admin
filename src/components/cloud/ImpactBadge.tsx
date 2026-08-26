import { cn } from '@/lib/classnames';
import type { Impact } from '@/types/cloud';

/**
 * What a change costs, in the gateway's own vocabulary. The wording is the
 * point: "restarts the blog" is what a rebuild means to the person deploying
 * it, and the difference between that and "nothing to apply" is the whole
 * reason the deploy step exists.
 */
export const IMPACT_META: Record<Impact, { label: string; blurb: string; tone: string }> = {
  none: {
    label: 'No effect',
    blurb: 'Stored, but nothing has to be rebuilt.',
    tone: 'border-border text-fg-muted',
  },
  reload: {
    label: 'Reload',
    blurb: 'Re-applies the configuration and re-renders every published post.',
    tone: 'border-border-strong text-fg',
  },
  rebuild: {
    label: 'Rebuild',
    blurb: 'Restarts the blog container, then re-renders. The site is briefly unavailable.',
    tone: 'border-warning/40 text-warning',
  },
  reroute: {
    label: 'Reroute',
    blurb: 'Moves every published URL and purges the old paths from the CDN.',
    tone: 'border-danger/40 text-danger',
  },
};

export function ImpactBadge({
  impact,
  className,
}: {
  impact: Impact;
  className?: string;
}) {
  const meta = IMPACT_META[impact] ?? IMPACT_META.reload;
  return (
    <span
      title={meta.blurb}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        meta.tone,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
