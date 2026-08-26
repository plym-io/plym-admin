import type {
  DocLink,
  Finish,
  Gateway,
  Guide,
  GuideCheck,
  GuideStep,
  GuideStrategy,
  Placement,
  RoutingKind,
  RoutingOptions,
  Snippet,
  Strategy,
} from '@/types/cloud';

/**
 * The connect-your-domain payloads, normalized. The gateway renders this copy
 * itself — steps, snippets and checks arrive already filled in with real
 * hostnames — so the only job here is to find those fields under whichever
 * names a given release uses and leave the text alone.
 *
 * Field names have moved once already (`label` → `name`, `body` → `detail`,
 * snippets from strings to objects), so every lookup still accepts the older
 * spellings: a panel that renders blank against a slightly older gateway is
 * worse than one carrying a few extra aliases.
 */

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function first(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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

function docs(raw: unknown): DocLink[] {
  return objects(raw)
    .map((d) => ({
      title: str(first(d, 'title', 'label', 'name')) ?? '',
      url: str(first(d, 'url', 'href', 'link')) ?? '',
    }))
    .filter((d) => d.url)
    .map((d) => ({ ...d, title: d.title || d.url }));
}

/** A gateway or strategy id turned into something presentable, as a last resort. */
function titleize(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A snippet arrives as an object now — label, language, optional filename and
 * the body — but older releases sent the body alone as a string.
 */
export function normalizeSnippet(raw: unknown): Snippet | null {
  if (typeof raw === 'string') return raw.trim() ? { body: raw } : null;
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const body = str(first(s, 'body', 'code', 'snippet', 'command', 'text'));
  if (!body) return null;
  return {
    body,
    label: str(first(s, 'label', 'title')),
    language: str(first(s, 'language', 'lang', 'syntax')),
    filename: str(first(s, 'filename', 'path', 'file')) ?? null,
  };
}

function normalizeStrategy(raw: Record<string, unknown>): Strategy {
  const id = str(first(raw, 'id', 'key', 'name')) ?? '';
  return {
    id,
    kind: str(first(raw, 'kind', 'type')),
    label: str(first(raw, 'title', 'label', 'name')) ?? titleize(id),
    summary: str(first(raw, 'summary', 'description', 'blurb')),
    support: str(first(raw, 'support', 'quality')),
    // Only an explicit false blocks a strategy — a release that omits the flag
    // shouldn't grey out every option.
    applicable: first(raw, 'applicable', 'available') !== false,
    blocked_reason: str(first(raw, 'blocked_reason', 'reason', 'why_not')) ?? null,
  };
}

export function normalizePlacement(raw: unknown): Placement | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const prefix = first(p, 'prefix', 'path', 'blog_prefix');
  return {
    slug: str(p.slug),
    origin_host: str(first(p, 'origin_host', 'upstream_host')),
    origin_url: str(first(p, 'origin_url', 'upstream_url')),
    platform_domain: str(p.platform_domain),
    public_host: str(first(p, 'public_host', 'host', 'hostname', 'domain')),
    public_url: str(first(p, 'public_url', 'url')),
    // An empty prefix is meaningful — a root-mounted blog has one.
    prefix: typeof prefix === 'string' ? prefix : undefined,
    blog_home: str(p.blog_home),
    admin_url: str(p.admin_url),
    subdomain_host: str(p.subdomain_host),
    at_root: bool(p.at_root),
    at_apex: bool(p.at_apex),
    subdomain_requested: bool(p.subdomain_requested),
    external_domain: bool(p.external_domain),
    destination: bool(p.destination),
  };
}

function normalizeGateway(raw: Record<string, unknown>): Gateway {
  const id = str(first(raw, 'id', 'key')) ?? '';
  const strategies = objects(first(raw, 'strategies', 'ways', 'options')).map(normalizeStrategy);
  const applicable = first(raw, 'applicable', 'available');
  return {
    id,
    label: str(first(raw, 'name', 'label', 'title')) ?? titleize(id),
    category: str(first(raw, 'category', 'group')),
    summary: str(first(raw, 'summary', 'description', 'blurb')),
    // The catalogue route answers without a tenant and so without the flag;
    // fall back to whether any of its strategies fit.
    applicable:
      applicable !== undefined
        ? applicable !== false
        : strategies.length === 0 || strategies.some((s) => s.applicable),
    strategies,
    docs: docs(raw.docs),
  };
}

function normalizeKind(raw: Record<string, unknown>): RoutingKind {
  const id = str(first(raw, 'id', 'key')) ?? '';
  return {
    id,
    label: str(first(raw, 'label', 'title', 'name')) ?? titleize(id),
    summary: str(first(raw, 'summary', 'description')),
  };
}

export function normalizeRouting(raw: unknown): RoutingOptions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rec = first(r, 'recommended', 'suggested');
  return {
    placement: normalizePlacement(first(r, 'placement', 'current', 'blog')),
    gateways: objects(first(r, 'gateways', 'routers', 'items'))
      .map(normalizeGateway)
      .filter((g) => g.id),
    kinds: objects(r.kinds).map(normalizeKind).filter((k) => k.id),
    recommended:
      typeof rec === 'string'
        ? { gateway: rec }
        : rec && typeof rec === 'object'
          ? {
              gateway: str(first(rec as Record<string, unknown>, 'gateway', 'gateway_id', 'id')),
              strategy: str(first(rec as Record<string, unknown>, 'strategy', 'strategy_id')),
              why: str(first(rec as Record<string, unknown>, 'why', 'reason')),
            }
          : undefined,
  };
}

function normalizeStep(raw: Record<string, unknown>): GuideStep {
  return {
    title: str(first(raw, 'title', 'name', 'label', 'summary')) ?? '',
    detail: str(first(raw, 'detail', 'body', 'description', 'text')),
    snippet: normalizeSnippet(first(raw, 'snippet', 'code', 'command')),
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

/**
 * The closing step. Without a `home` there is nothing to apply, so a finish
 * that lost it is dropped rather than rendered as a button that can't work.
 */
function normalizeFinish(raw: unknown): Finish | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const home = str(first(f, 'home', 'url'));
  if (!home) return null;
  return {
    title: str(first(f, 'title', 'label')),
    detail: str(first(f, 'detail', 'description', 'body')),
    home,
    register_hostname: first(f, 'register_hostname', 'register') === true,
  };
}

function normalizeGuideStrategy(raw: Record<string, unknown>): GuideStrategy {
  const finish = normalizeFinish(raw.finish);
  return {
    ...normalizeStrategy(raw),
    steps: objects(first(raw, 'steps', 'instructions')).map(normalizeStep),
    finish,
    checks: objects(first(raw, 'checks', 'verification', 'verify')).map(normalizeCheck),
    requires: strings(first(raw, 'requires', 'requirements', 'prerequisites')),
    caveats: strings(first(raw, 'caveats', 'warnings', 'notes')),
    docs: docs(raw.docs),
    register_hostname:
      first(raw, 'register_hostname') === true || finish?.register_hostname === true,
  };
}

export function normalizeGuide(raw: unknown, fallbackId = ''): Guide {
  const g = (raw ?? {}) as Record<string, unknown>;
  const field = first(g, 'gateway', 'router');
  const info = (field && typeof field === 'object' ? field : {}) as Record<string, unknown>;
  const gateway =
    typeof field === 'string' ? field : (str(first(info, 'id', 'name')) ?? fallbackId);
  const label =
    str(first(info, 'name', 'label', 'title')) ??
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
    category: str(first(info, 'category', 'group')),
    summary: str(first(info, 'summary', 'description')),
    docs: docs(first(info, 'docs') ?? g.docs),
    placement: normalizePlacement(first(g, 'placement', 'current')),
    contract: strings(g.contract),
    strategies,
  };
}
