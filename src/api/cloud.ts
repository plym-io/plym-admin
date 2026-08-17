import { apiBase } from '@/lib/base';
import { freshAccessToken, renewSession } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { normalizeError, type ApiError } from '@/api/errors';
import {
  normalizeChangeLog,
  normalizePlan,
  normalizeSettings,
} from '@/lib/settings';
import { normalizeGuide, normalizeRouting } from '@/lib/routing';
import type {
  Accepted,
  Capabilities,
  EventPage,
  Guide,
  Plan,
  RoutingOptions,
  SettingsChange,
  SettingsDocument,
  TemplateCatalog,
  TemplateSource,
  TenantStatus,
} from '@/types/cloud';

/**
 * The plym-cloud tenant gateway. It sits on the same origin as the panel, one
 * segment along from it — `/blog/plym-admin/` ⇒ `/blog/cloud` — and takes the
 * same access token the panel already holds.
 *
 * It is not the plym API: different base, different error body, and every write
 * answers 202 with an operation to poll rather than a result. That is why it
 * gets its own thin client instead of another `openapi-fetch` instance.
 */
export const cloudBase = `${apiBase}/cloud`;

/** The gateway's errors carry a `remedy` written for a human. Keep it. */
export interface CloudError extends ApiError {
  remedy?: string | null;
}

async function toError(res: Response): Promise<CloudError> {
  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    /* not JSON — fall through */
  }
  const b = body as Record<string, unknown> | null;
  if (b && typeof b.message === 'string') {
    return {
      code: typeof b.kind === 'string' ? b.kind : `http.${res.status}`,
      message: b.message,
      remedy: typeof b.remedy === 'string' ? b.remedy : null,
      status: res.status,
      raw: body,
    };
  }
  return normalizeError(res);
}

async function request<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & {
    body?: unknown;
    auth?: boolean;
    /** Another mount of this same gateway — see `getOpEvents`. Defaults to ours. */
    base?: string;
  } = {},
): Promise<T> {
  const { auth = true, body, base = cloudBase, ...rest } = init;

  const send = async (token: string | null) => {
    const headers = new Headers(rest.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return fetch(`${base}${path}`, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send(auth ? await freshAccessToken() : null);
  // Same rule as the plym client: plym answers 403 as well as 401 for a spent
  // token, and the gateway verifies that same token — so both get one retry
  // behind a refresh.
  if (auth && (res.status === 401 || res.status === 403)) {
    if (await renewSession()) res = await send(useAuthStore.getState().accessToken);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Edition = 'oss' | 'cloud';

/**
 * Which product this blog is running, decided by whether a cloud gateway
 * answers under the panel's own prefix.
 *
 * We ask `/cloud/capabilities` rather than `/cloud` itself: the gateway
 * declares no route at its own root, so a bare `/cloud` would 404 on a cloud
 * deployment too. `/capabilities` and `/health` are its only unauthenticated
 * routes, and anything that isn't a 404 from either — including a 503 while the
 * platform is still coming up — means a gateway is there. A request that never
 * lands at all is not an answer, so it leaves the edition unknown rather than
 * silently demoting a cloud blog to OSS.
 */
export async function detectEdition(): Promise<{
  edition: Edition | null;
  capabilities: Capabilities | null;
}> {
  let capabilities: Capabilities | null = null;
  let res: Response;
  try {
    res = await fetch(`${cloudBase}/capabilities`, { headers: { Accept: 'application/json' } });
  } catch {
    return { edition: null, capabilities: null };
  }
  if (res.ok) {
    try {
      capabilities = (await res.json()) as Capabilities;
    } catch {
      capabilities = {};
    }
    return { edition: 'cloud', capabilities };
  }
  if (res.status !== 404) return { edition: 'cloud', capabilities: null };

  // No /capabilities. Older gateway, or genuinely no gateway — /health decides.
  try {
    const health = await fetch(`${cloudBase}/health`, { headers: { Accept: 'application/json' } });
    return { edition: health.status === 404 ? 'oss' : 'cloud', capabilities: null };
  } catch {
    return { edition: null, capabilities: null };
  }
}

/* ── settings ─────────────────────────────────────────────────────────── */

export async function getSettings(): Promise<SettingsDocument> {
  return normalizeSettings(await request<unknown>('/settings'));
}

/** Dry run. Safe to call as often as you like — nothing is written. */
export async function planSettings(patch: Record<string, unknown>): Promise<Plan> {
  return normalizePlan(await request<unknown>('/settings/plan', { method: 'POST', body: patch }));
}

/** Starts the change. Poll the returned `op_id` for what happens next. */
export function applySettings(patch: Record<string, unknown>): Promise<Accepted> {
  return request<Accepted>('/settings', { method: 'PUT', body: patch });
}

export async function getSettingsChanges(limit = 20): Promise<SettingsChange[]> {
  return normalizeChangeLog(await request<unknown>(`/settings/changes?limit=${limit}`));
}

/* ── templates ────────────────────────────────────────────────────────── */

/** Coerce a list field that an older gateway may omit entirely. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function getTemplates(): Promise<TemplateCatalog> {
  const raw = (await request<unknown>('/templates')) as Record<string, unknown>;
  return {
    slug: typeof raw?.slug === 'string' ? raw.slug : undefined,
    available: stringList(raw?.available),
    active: typeof raw?.active === 'string' ? raw.active : null,
    public: stringList(raw?.public),
    // Empty when the tenant has no registry folder, or the registry isn't
    // configured at all — both are ordinary, not an error to report.
    private: stringList(raw?.private),
    source: typeof raw?.source === 'string' ? raw.source : undefined,
  };
}

/**
 * Fetch a template into this blog. Installing restarts the container and
 * re-renders every post, so it answers 202 with an op to poll — same loop the
 * settings apply already uses.
 */
export function installTemplate(
  name: string,
  source: TemplateSource = 'public',
  opts: { update?: boolean; ref?: string } = {},
): Promise<Accepted> {
  return request<Accepted>('/templates', {
    method: 'POST',
    body: {
      name,
      source,
      ...(opts.update ? { update: true } : {}),
      ...(opts.ref ? { ref: opts.ref } : {}),
    },
  });
}

/* ── operations ───────────────────────────────────────────────────────── */

/**
 * `base` re-points this one call at another mount of the same gateway. An
 * operation that changes the blog prefix moves the gateway out from under the
 * page that started it, and the only way to learn how that operation ended is
 * to ask for it where the gateway now answers — see `OpProgress`.
 */
export function getOpEvents(opId: string, after = 0, base?: string): Promise<EventPage> {
  return request<EventPage>(`/ops/${encodeURIComponent(opId)}/events?after=${after}`, {
    base,
  });
}

/* ── routing ──────────────────────────────────────────────────────────── */

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const q = search.toString();
  return q ? `?${q}` : '';
}

/**
 * `home` is the address the owner wants, as a full https URL. Pass it and the
 * whole payload — placement, applicability, every snippet — is rendered against
 * that destination instead of the plym hostname the blog answers on today.
 * Omitting it describes the blog as it is currently served, which is only what
 * you want before the owner has chosen.
 */
export async function getRouting(home?: string): Promise<RoutingOptions> {
  return normalizeRouting(await request<unknown>(`/routing${query({ home })}`));
}

export async function getGuide(
  gatewayId: string,
  opts: { strategy?: string; home?: string } = {},
): Promise<Guide> {
  return normalizeGuide(
    await request<unknown>(
      `/routing/${encodeURIComponent(gatewayId)}${query({ strategy: opts.strategy, home: opts.home })}`,
    ),
    gatewayId,
  );
}

/**
 * The closing move of the connect-your-domain flow. Send the guide's
 * `finish.home` and `finish.register_hostname` verbatim: plym re-renders every
 * page, canonical tag and sitemap entry for the new address and, for
 * subdomains, registers the hostname and orders its certificate in the same op.
 */
export function setHome(url: string, registerHostname = false): Promise<Accepted> {
  return request<Accepted>('/home', {
    method: 'PUT',
    body: { url, register_hostname: registerHostname },
  });
}

/* ── tenant ───────────────────────────────────────────────────────────── */

export function getStatus(): Promise<TenantStatus> {
  return request<TenantStatus>('/status');
}
