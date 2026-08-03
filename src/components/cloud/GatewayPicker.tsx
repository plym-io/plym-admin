import { useMemo, useState } from 'react';
import { CaretDown, MagnifyingGlass, Star } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';
import type { Gateway } from '@/types/cloud';
import { Input } from '@/components/ui/input';

/** Above this many, a wall of options needs a way to skip straight to one. */
const SEARCHABLE_FROM = 9;

/** Plain headings for the categories the gateway groups its catalogue into. */
const CATEGORY_LABELS: Record<string, string> = {
  cdn: 'CDNs and edge networks',
  dns: 'DNS providers',
  proxy: 'Proxies and load balancers',
  'web-server': 'Web servers',
  webserver: 'Web servers',
  server: 'Web servers',
  host: 'Hosting platforms',
  hosting: 'Hosting platforms',
  platform: 'Hosting platforms',
  paas: 'Hosting platforms',
  ecommerce: 'Commerce platforms',
  'site-builder': 'Website builders',
  builder: 'Website builders',
  cms: 'Website builders',
  framework: 'Frameworks',
  other: 'Anything else',
};

function categoryLabel(id: string): string {
  return (
    CATEGORY_LABELS[id.toLowerCase()] ??
    id.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

function GatewayCard({
  gateway,
  selected,
  recommended,
  onSelect,
}: {
  gateway: Gateway;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  const blocked = !gateway.applicable;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={blocked}
      aria-pressed={selected}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-accent bg-accent-soft'
          : 'border-border hover:border-border-strong hover:bg-bg-subtle',
        blocked && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[14px] font-medium text-fg">{gateway.label}</span>
        {recommended && (
          <Star size={13} weight="fill" className="shrink-0 text-accent" aria-label="Recommended" />
        )}
      </div>
      {gateway.summary && (
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-muted">
          {gateway.summary}
        </p>
      )}
    </button>
  );
}

/**
 * Which gateway sits in front of the owner's domain.
 *
 * The catalogue arrives flat and long, which as a row of chips read as a wall
 * of jargon. Here it is grouped by the kind of thing each one is, the
 * recommendation is lifted out on its own, options that can't serve the address
 * the owner chose are folded away instead of greyed in place, and past a
 * certain length there is a filter — you know the name of your own CDN.
 */
export function GatewayPicker({
  gateways,
  selected,
  recommended,
  why,
  onSelect,
}: {
  gateways: Gateway[];
  selected: string | null;
  /** Gateway id the routing payload puts first. */
  recommended?: string | null;
  /** The payload's own reason for that recommendation. */
  why?: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [showBlocked, setShowBlocked] = useState(false);

  const term = filter.trim().toLowerCase();
  const matches = useMemo(
    () =>
      term
        ? gateways.filter((g) =>
            `${g.label} ${g.summary ?? ''} ${g.id}`.toLowerCase().includes(term),
          )
        : gateways,
    [gateways, term],
  );

  const pick = matches.find((g) => g.id === recommended && g.applicable);
  const rest = matches.filter((g) => g !== pick);
  const usable = rest.filter((g) => g.applicable);
  const blocked = rest.filter((g) => !g.applicable);

  const groups = useMemo(() => {
    const by = new Map<string, Gateway[]>();
    for (const g of usable) {
      const key = g.category ?? 'other';
      const list = by.get(key);
      if (list) list.push(g);
      else by.set(key, [g]);
    }
    return [...by.entries()].sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));
  }, [usable]);

  return (
    <div className="space-y-5">
      {gateways.length >= SEARCHABLE_FROM && (
        <div className="relative">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search — Cloudflare, nginx, Vercel…"
            className="pl-9"
            aria-label="Filter the list"
          />
        </div>
      )}

      {pick && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Suggested for you
          </h3>
          <GatewayCard
            gateway={pick}
            recommended
            selected={selected === pick.id}
            onSelect={() => onSelect(pick.id)}
          />
          {why && <p className="mt-1.5 text-[12.5px] text-fg-muted">{why}</p>}
        </div>
      )}

      {groups.map(([category, list]) => (
        <div key={category}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {categoryLabel(category)}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((g) => (
              <GatewayCard
                key={g.id}
                gateway={g}
                selected={selected === g.id}
                onSelect={() => onSelect(g.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {matches.length === 0 && (
        <p className="text-sm text-fg-muted">
          Nothing matches “{filter.trim()}”. Try the name of your CDN, host or web server.
        </p>
      )}

      {blocked.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            className="flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
          >
            <CaretDown
              size={12}
              weight="bold"
              className={cn('transition-transform', showBlocked && 'rotate-180')}
            />
            {blocked.length} that can’t serve this address
          </button>
          {showBlocked && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {blocked.map((g) => (
                <GatewayCard key={g.id} gateway={g} selected={false} onSelect={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
