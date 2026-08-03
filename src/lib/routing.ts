import type {
  Gateway,
  Guide,
  GuideCheck,
  GuideStep,
  GuideStrategy,
  Placement,
  RoutingOptions,
  Strategy,
} from '@/types/cloud';

/**
 * The connect-your-domain payloads, normalized. The gateway renders this copy
 * itself — steps, snippets and checks arrive already filled in with the blog's
 * real hostname — so the only job here is to find those fields under whichever
 * names a given release uses and leave the text alone.
 */

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function first(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
}

function objects(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object');
  }
  if (raw && typeof raw === 'object') {
    // A map of id → entry: fold the id in so it survives.
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => Boolean(v) && typeof v === 'object')
      .map(([id, v]) => ({ id, ...(v as Record<string, unknown>) }));
  }
  return [];
}

function strings(raw: unknown): string[] {
  if (typeof raw === 'string') return raw ? [raw] : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) =>
      typeof v === 'string'
        ? v
        : v && typeof v === 'object'
          ? (str(first(v as Record<string, unknown>, 'text', 'message', 'label', 'title')) ??
            JSON.stringify(v))
          : String(v),
    )
    .filter(Boolean);
}

/** A gateway or strategy id turned into something presentable, as a last resort. */
function titleize(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeStrategy(raw: Record<string, unknown>): Strategy {
  const id = str(first(raw, 'id', 'key', 'name')) ?? '';
  return {
    id,
    label: str(first(raw, 'label', 'title', 'name')) ?? titleize(id),
    summary: str(first(raw, 'summary', 'description', 'blurb')),
    // Only an explicit false blocks a strategy — a release that omits the flag
    // shouldn't grey out every option.
    applicable: first(raw, 'applicable', 'available') !== false,
    blocked_reason: str(first(raw, 'blocked_reason', 'reason', 'why_not')) ?? null,
    support: str(first(raw, 'support', 'quality')),
    recommended: first(raw, 'recommended', 'preferred') === true,
  };
}

export function normalizePlacement(raw: unknown): Placement | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  return {
    host: str(first(p, 'host', 'hostname', 'domain')),
    prefix: typeof p.prefix === 'string' ? p.prefix : str(first(p, 'path', 'blog_prefix')),
    url: str(first(p, 'url', 'public_url')),
  };
}

function normalizeGateway(raw: Record<string, unknown>): Gateway {
  const id = str(first(raw, 'id', 'key', 'name')) ?? '';
  return {
    id,
    label: str(first(raw, 'label', 'title', 'name')) ?? titleize(id),
    description: str(first(raw, 'description', 'summary', 'blurb')),
    strategies: objects(first(raw, 'strategies', 'ways', 'options')).map(normalizeStrategy),
  };
}

export function normalizeRouting(raw: unknown): RoutingOptions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rec = first(r, 'recommended', 'suggested');
  return {
    placement: normalizePlacement(first(r, 'placement', 'current', 'blog')),
    gateways: objects(first(r, 'gateways', 'routers', 'items')).map(normalizeGateway).filter((g) => g.id),
    recommended:
      typeof rec === 'string'
        ? { gateway: rec }
        : rec && typeof rec === 'object'
          ? {
              gateway: str(first(rec as Record<string, unknown>, 'gateway', 'gateway_id', 'id')),
              strategy: str(first(rec as Record<string, unknown>, 'strategy', 'strategy_id')),
            }
          : undefined,
  };
}

function normalizeStep(raw: Record<string, unknown>): GuideStep {
  return {
    title: str(first(raw, 'title', 'name', 'label', 'summary')) ?? '',
    body: str(first(raw, 'body', 'description', 'text', 'detail')),
    snippet: str(first(raw, 'snippet', 'code', 'command')) ?? null,
    actor: str(first(raw, 'actor', 'who')),
  };
}

function normalizeCheck(raw: Record<string, unknown>): GuideCheck {
  return {
    title: str(first(raw, 'title', 'name', 'label')),
    command: str(first(raw, 'command', 'cmd', 'run', 'snippet')),
    expect: str(first(raw, 'expect', 'expected', 'result', 'then')),
  };
}

function normalizeGuideStrategy(raw: Record<string, unknown>): GuideStrategy {
  return {
    ...normalizeStrategy(raw),
    steps: objects(first(raw, 'steps', 'instructions')).map(normalizeStep),
    checks: objects(first(raw, 'checks', 'verification', 'verify')).map(normalizeCheck),
    caveats: strings(first(raw, 'caveats', 'warnings', 'notes')),
    requires: strings(first(raw, 'requires', 'requirements', 'prerequisites')),
  };
}

export function normalizeGuide(raw: unknown, fallbackId = ''): Guide {
  const g = (raw ?? {}) as Record<string, unknown>;
  const gatewayField = first(g, 'gateway', 'router');
  const gateway =
    typeof gatewayField === 'string'
      ? gatewayField
      : gatewayField && typeof gatewayField === 'object'
        ? (str(first(gatewayField as Record<string, unknown>, 'id', 'name')) ?? fallbackId)
        : fallbackId;
  const label =
    (gatewayField && typeof gatewayField === 'object'
      ? str(first(gatewayField as Record<string, unknown>, 'label', 'title', 'name'))
      : undefined) ??
    str(first(g, 'label', 'title')) ??
    titleize(gateway);
  // A guide asked for with ?strategy= may answer with the one strategy inline
  // rather than a list of them.
  const list = first(g, 'strategies', 'ways', 'options');
  const strategies = list
    ? objects(list).map(normalizeGuideStrategy)
    : g.steps
      ? [normalizeGuideStrategy(g)]
      : [];
  return {
    gateway,
    label,
    placement: normalizePlacement(first(g, 'placement', 'current')),
    strategies,
  };
}
