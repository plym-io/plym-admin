import { useCallback, useEffect, useState } from 'react';
import {
  ArrowSquareOut,
  CheckCircle,
  Globe,
  Info,
  Prohibit,
} from '@phosphor-icons/react';
import { getGuide, getRouting, getStatus } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { cn } from '@/lib/classnames';
import type { Guide, GuideStrategy, RoutingOptions, TenantStatus } from '@/types/cloud';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Snippet } from '@/components/cloud/Snippet';

/** `customer` is the person reading this; `plym` is us. */
function actorLabel(actor?: string): string | null {
  if (!actor) return null;
  return actor === 'customer' ? 'You' : actor === 'plym' ? 'plym' : actor;
}

function StrategyBody({ strategy }: { strategy: GuideStrategy }) {
  return (
    <div className="space-y-5">
      {strategy.summary && <p className="text-sm text-fg-muted">{strategy.summary}</p>}

      {strategy.requires.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            You'll need
          </h4>
          <ul className="mt-1.5 space-y-1">
            {strategy.requires.map((r) => (
              <li key={r} className="flex gap-2 text-[13.5px] text-fg-muted">
                <span className="text-fg-subtle">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-4">
        {strategy.steps.map((step, i) => (
          <li key={`${step.title}-${i}`} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[12px] font-medium text-fg-muted tnum">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-fg">{step.title}</p>
                {actorLabel(step.actor) && (
                  <span
                    className={cn(
                      'rounded-full border px-1.5 py-px text-[10.5px] font-medium',
                      step.actor === 'plym'
                        ? 'border-accent/40 text-accent'
                        : 'border-border text-fg-subtle',
                    )}
                  >
                    {actorLabel(step.actor)}
                  </span>
                )}
              </div>
              {step.body && (
                <p className="mt-0.5 whitespace-pre-line text-[13.5px] text-fg-muted">
                  {step.body}
                </p>
              )}
              {step.snippet && <Snippet code={step.snippet} className="mt-2" />}
            </div>
          </li>
        ))}
      </ol>

      {strategy.checks.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <CheckCircle size={13} /> Check it worked
          </h4>
          <div className="mt-2 space-y-3">
            {strategy.checks.map((check, i) => (
              <div key={`${check.command}-${i}`}>
                {check.title && (
                  <p className="mb-1 text-[13.5px] text-fg">{check.title}</p>
                )}
                {check.command && <Snippet code={check.command} />}
                {check.expect && (
                  <p className="mt-1 text-[13px] text-fg-muted">
                    Expect: {check.expect}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}

/**
 * Connect a domain. The gateway writes this screen: it knows the blog's real
 * hostname, so its steps, snippets and checks arrive already filled in and are
 * shown here verbatim. All this page decides is which gateway and which way of
 * connecting the user is looking at.
 */
export default function Domain() {
  const [routing, setRouting] = useState<RoutingOptions | null>(null);
  const [status, setStatus] = useState<TenantStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [gatewayId, setGatewayId] = useState<string | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        /* the routing payload's own placement covers this */
      });
    getRouting()
      .then((r) => {
        if (cancelled) return;
        setRouting(r);
        setGatewayId(r.recommended?.gateway ?? r.gateways[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(isApiError(e) ? e.message : 'Could not load the routing options');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGuide = useCallback(async (id: string) => {
    setGuide(null);
    setGuideError(null);
    try {
      const g = await getGuide(id);
      setGuide(g);
      const usable = g.strategies.find((s) => s.recommended && s.applicable)
        ?? g.strategies.find((s) => s.applicable)
        ?? g.strategies[0];
      setStrategyId(usable?.id ?? null);
    } catch (e) {
      setGuideError(isApiError(e) ? e.message : 'Could not load the guide');
    }
  }, []);

  useEffect(() => {
    if (gatewayId) void loadGuide(gatewayId);
  }, [gatewayId, loadGuide]);

  const placement = guide?.placement ?? routing?.placement;
  const publicUrl =
    status?.url ??
    placement?.url ??
    (placement?.host ? `https://${placement.host}${placement.prefix ?? ''}` : null);
  const strategy = guide?.strategies.find((s) => s.id === strategyId) ?? null;

  return (
    <Page width="text">
      <PageHeader
        title="Domain"
        description="Serve this blog from your own domain — on a subdomain, or under a path on the site you already have."
      />

      {/* Where it lives today. */}
      <div className="mt-6 flex items-center gap-4 rounded-lg border border-border p-4">
        <Globe size={20} weight="duotone" className="shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg-muted">Your blog is served at</p>
          {publicUrl ? (
            <p className="truncate font-mono text-[13.5px] text-fg">{publicUrl}</p>
          ) : (
            <Skeleton className="mt-1 h-4 w-56" />
          )}
        </div>
        {publicUrl && (
          <Button variant="ghost" size="sm" onClick={() => window.open(publicUrl, '_blank')}>
            Visit <ArrowSquareOut size={14} />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <p className="mt-8 text-sm text-danger">{error}</p>
      ) : !routing?.gateways.length ? (
        <EmptyState
          className="mt-6"
          icon={Globe}
          title="No routing guides available."
          hint="This deployment didn't publish any gateways to connect through."
        />
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">
              What sits in front of your domain?
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Pick the CDN, proxy or platform your main site already runs on. The steps
              are written for it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {routing.gateways.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGatewayId(g.id)}
                  title={g.description}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                    g.id === gatewayId
                      ? 'border-accent bg-accent-soft text-fg'
                      : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            {guideError ? (
              <p className="text-sm text-danger">{guideError}</p>
            ) : !guide ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <>
                {guide.strategies.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
                    {guide.strategies.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!s.applicable}
                        onClick={() => setStrategyId(s.id)}
                        title={s.applicable ? s.summary : (s.blocked_reason ?? undefined)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                          s.id === strategyId
                            ? 'bg-bg-muted font-medium text-fg'
                            : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
                          !s.applicable && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                        )}
                      >
                        {!s.applicable && <Prohibit size={13} />}
                        {s.label}
                        {s.recommended && s.applicable && (
                          <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-medium text-accent">
                            recommended
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  {strategy ? (
                    strategy.applicable ? (
                      <StrategyBody strategy={strategy} />
                    ) : (
                      <div className="rounded-lg border border-border bg-bg-subtle p-4">
                        <p className="text-[13.5px] text-fg">
                          {strategy.blocked_reason ??
                            "This way of connecting doesn't fit where your blog is mounted."}
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-sm text-fg-muted">
                      This gateway has no connection guides yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
