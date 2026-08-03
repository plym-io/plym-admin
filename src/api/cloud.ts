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
  init: Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { auth = true, body, ...rest } = init;

  const send = async (token: string | null) => {
    const headers = new Headers(rest.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return fetch(`${cloudBase}${path}`, {
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

/* ── operations ───────────────────────────────────────────────────────── */

export function getOpEvents(opId: string, after = 0): Promise<EventPage> {
  return request<EventPage>(`/ops/${encodeURIComponent(opId)}/events?after=${after}`);
}

/* ── routing ──────────────────────────────────────────────────────────── */

export async function getRouting(): Promise<RoutingOptions> {
  return normalizeRouting(await request<unknown>('/routing'));
}

export async function getGuide(gatewayId: string, strategy?: string): Promise<Guide> {
  const query = strategy ? `?strategy=${encodeURIComponent(strategy)}` : '';
  return normalizeGuide(
    await request<unknown>(`/routing/${encodeURIComponent(gatewayId)}${query}`),
    gatewayId,
  );
}

/* ── tenant ───────────────────────────────────────────────────────────── */

export function getStatus(): Promise<TenantStatus> {
  return request<TenantStatus>('/status');
}
