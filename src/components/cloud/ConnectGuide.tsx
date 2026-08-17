import { useMemo } from 'react';
import { ArrowSquareOut, Info, Prohibit } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';
import type { GuideStrategy, RoutingKind } from '@/types/cloud';
import { Snippet } from './Snippet';

/**
 * How the gateway rates a way of connecting. `supported` is the norm and needs
 * no badge — only say something when there is a reason to hesitate.
 */
const SUPPORT_BADGE: Record<string, { label: string; className: string }> = {
  advanced: { label: 'Advanced', className: 'border-border text-fg-subtle' },
  'not-recommended': {
    label: 'Not recommended',
    className: 'border-warning/40 text-warning',
  },
};

export function SupportBadge({ support }: { support?: string }) {
  const badge = support ? SUPPORT_BADGE[support] : undefined;
  if (!badge) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-medium',
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

/**
 * Picks between the ways one gateway can serve the chosen address. Most
 * gateways offer more than one, but the address the owner typed usually rules
 * all but one of them out, so this renders nothing at all in the common case.
 *
 * When it does render, the titles alone don't say what the choice is —
 * Cloudflare offers "Proxy /blog with a Worker", "Proxy /blog with an Origin
 * Rule" and "Serve the blog at blog.plym.io", and only the last one changes the
 * address readers type. That distinction is the payload's `kinds` taxonomy, so
 * each option is tagged with its kind and the kinds in play are spelled out
 * underneath, in the gateway's own words.
 */
export function StrategyChoice({
  strategies,
  kinds,
  selected,
  onSelect,
}: {
  strategies: GuideStrategy[];
  /** The catalogue's own description of each family. Empty on an older gateway. */
  kinds?: RoutingKind[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(
    () => new Map((kinds ?? []).map((k) => [k.id, k])),
    [kinds],
  );
  // Only worth explaining when the options actually differ in kind; two ways of
  // proxying the same path don't need a paragraph about proxying paths.
  const legend = useMemo(() => {
    const present = [...new Set(strategies.map((s) => s.kind).filter(Boolean))];
    if (present.length < 2) return [];
    return present
      .map((id) => byId.get(id as string))
      .filter((k): k is RoutingKind => Boolean(k?.summary));
  }, [strategies, byId]);

  if (strategies.length < 2) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 text-[13px] text-fg-muted">There is more than one way to do this:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {strategies.map((s) => {
          const kind = s.kind ? byId.get(s.kind) : undefined;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={s.id === selected}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                s.id === selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-border hover:border-border-strong hover:bg-bg-subtle',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13.5px] font-medium text-fg">{s.label}</span>
                <SupportBadge support={s.support} />
              </div>
              {s.summary && (
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-muted">
                  {s.summary}
                </p>
              )}
              {kind && (
                <span className="mt-2 inline-block rounded-full border border-border px-1.5 py-px text-[10.5px] font-medium text-fg-subtle">
                  {kind.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {legend.length > 0 && (
        <dl className="mt-3 space-y-1">
          {legend.map((k) => (
            <div key={k.id} className="flex gap-1.5 text-[12.5px] leading-snug">
              <dt className="shrink-0 font-medium text-fg-muted">{k.label}</dt>
              <dd className="min-w-0 text-fg-subtle">{k.summary}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The instructions themselves.
 *
 * Everything in `steps` is the owner's own work — the gateway keeps plym's side
 * out of that list entirely — so there are no "who does this" badges to read
 * past. Snippets arrive already rendered against the real hostnames, so they
 * are shown verbatim and never reflowed. What is left of the payload is
 * arranged by when you need it: prerequisites above the steps, caveats below
 * them, documentation last.
 */
export function ConnectGuide({ strategy }: { strategy: GuideStrategy }) {
  if (!strategy.applicable) {
    return (
      <div className="flex gap-2.5 rounded-lg border border-border bg-bg-subtle p-4">
        <Prohibit size={16} className="mt-px shrink-0 text-fg-subtle" />
        <p className="text-[13.5px] text-fg-muted">
          {strategy.blocked_reason ??
            'This way of connecting does not fit the address you chose.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {strategy.requires.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-subtle px-3.5 py-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Before you start
          </h4>
          <ul className="mt-1.5 space-y-1">
            {strategy.requires.map((r) => (
              <li key={r} className="flex gap-2 text-[13.5px] text-fg-muted">
                <span aria-hidden className="text-fg-subtle">
                  ·
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-5">
        {strategy.steps.map((step, i) => (
          <li key={`${step.title}-${i}`} className="flex gap-3">
            <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-bg-muted text-[11.5px] font-medium text-fg-muted tnum">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-fg">{step.title}</p>
              {step.detail && (
                <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-fg-muted">
                  {step.detail}
                </p>
              )}
              {step.snippet && (
                <Snippet
                  code={step.snippet.body}
                  label={step.snippet.label}
                  filename={step.snippet.filename}
                  className="mt-2"
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      {strategy.caveats.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-warning">
            <Info size={14} weight="fill" /> Worth knowing
          </h4>
          <ul className="mt-1.5 space-y-1">
            {strategy.caveats.map((c) => (
              <li key={c} className="text-[13px] text-fg-muted">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {strategy.docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {strategy.docs.map((d) => (
            <a
              key={d.url}
              href={d.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[13px] text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
            >
              {d.title}
              <ArrowSquareOut size={12} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
