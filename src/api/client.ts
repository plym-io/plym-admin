import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { useAuthStore } from '@/store/auth';
import { adminBase, apiBase } from '@/lib/base';
import { normalizeError, type ApiError } from './errors';

const REFRESH_PATH = '/api/auth/refresh';
const LOGIN_PATH = '/api/auth/login';

/** Treat a token as spent this long before `exp`, to absorb clock drift. */
const CLOCK_SKEW_MS = 30_000;

/** Expiry of a JWT as an epoch in ms, or null if the claim can't be read. */
function expiryOf(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const exp = (
      JSON.parse(
        atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')),
      ) as { exp?: unknown }
    ).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** False for an opaque or `exp`-less token — those fall back to the 401 path. */
function isExpired(token: string): boolean {
  const exp = expiryOf(token);
  return exp !== null && Date.now() >= exp - CLOCK_SKEW_MS;
}

/**
 * Unconsumed copies of in-flight requests, keyed by openapi-fetch's per-call
 * id. `fetch` disturbs the Request it is given, so by the time `onResponse`
 * runs the original can no longer be replayed — a 401 retry has to be built
 * from a copy taken before the send.
 */
const replayable = new Map<string, Request>();

/**
 * `renewed` — we hold a fresh access token.
 * `rejected` — the refresh token is spent; the session has been cleared.
 * `unreachable` — the refresh never got an answer. The session is still
 *   presumed good, so we surface the original failure rather than log out.
 */
type RefreshOutcome = 'renewed' | 'rejected' | 'unreachable';

/**
 * Single in-flight refresh. Concurrent 401s await the same promise so we
 * never fire parallel refreshes (BRD §9 — mutex around refresh).
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function runRefresh(): Promise<RefreshOutcome> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return 'rejected';
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // A dropped connection is not a rejected refresh token. Clearing the
    // session here would sign the user out — and discard their unsaved
    // draft — over a momentary blip.
    return 'unreachable';
  }
  if (!res.ok) {
    clear();
    return 'rejected';
  }
  try {
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    setTokens(data.access_token, data.refresh_token);
    return 'renewed';
  } catch {
    clear();
    return 'rejected';
  }
}

function ensureRefresh(): Promise<RefreshOutcome> {
  refreshInFlight ??= runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath, id }) {
    if (schemaPath === REFRESH_PATH || schemaPath === LOGIN_PATH) return request;
    let token = useAuthStore.getState().accessToken;
    // Renew *before* spending a request on a token we already know is dead:
    // one round trip instead of three, and no window where a save lands as
    // an anonymous request. It also parks anything raised mid-refresh on the
    // same promise rather than letting it go out with the stale token.
    if (token && isExpired(token)) {
      await ensureRefresh();
      token = useAuthStore.getState().accessToken;
    }
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    // Bank a copy while the body is still readable — see `replayable`.
    replayable.set(id, request.clone());
    return request;
  },

  async onResponse({ request, response, schemaPath, id }) {
    const original = replayable.get(id) ?? request;
    replayable.delete(id);

    // Plym returns 403 (not just 401) for an expired/invalid access token,
    // so both must trigger the refresh-and-retry flow — otherwise the
    // request just fails with a raw "Forbidden" until the user reloads.
    if (
      (response.status !== 401 && response.status !== 403) ||
      schemaPath === REFRESH_PATH ||
      schemaPath === LOGIN_PATH ||
      request.headers.get('x-retried') === '1'
    ) {
      return response;
    }

    const outcome = await ensureRefresh();
    if (outcome === 'rejected') {
      // Hard logout — let the router send the user to the login screen.
      if (!location.pathname.endsWith('/login')) {
        window.location.assign(`${adminBase}/login`);
      }
      return response;
    }
    // Couldn't reach the refresh endpoint: the session may well be fine, so
    // hand back the 401 and let the caller retry (autosave will, on the next
    // keystroke) instead of tearing the session down.
    if (outcome === 'unreachable') return response;

    const token = useAuthStore.getState().accessToken;
    // `original` still has its body; `request` was drained by the send above,
    // and rebuilding from it throws for anything carrying a payload — which is
    // every autosave, create and publish.
    const retry = new Request(original, {});
    if (token) retry.headers.set('Authorization', `Bearer ${token}`);
    retry.headers.set('x-retried', '1');
    return fetch(retry);
  },

  onError({ id }) {
    replayable.delete(id);
  },
};

export const api = createClient<paths>({ baseUrl: apiBase });
api.use(authMiddleware);

/**
 * The access token, renewed first if it has expired. For callers that can't go
 * through `api` — the uploader needs XHR for progress events — so they get the
 * same "never send a token we know is dead" guarantee the middleware gives.
 */
export async function freshAccessToken(): Promise<string | null> {
  const token = useAuthStore.getState().accessToken;
  if (!token || !isExpired(token)) return token;
  await ensureRefresh();
  return useAuthStore.getState().accessToken;
}

/** Force a refresh (e.g. after a bare 401 outside the middleware). */
export async function renewSession(): Promise<boolean> {
  return (await ensureRefresh()) === 'renewed';
}

/**
 * Thin wrapper that throws a normalized {@link ApiError} on failure so call
 * sites can `try/catch` uniformly. Returns the parsed data on success.
 */
export async function call<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (error !== undefined || !response.ok) {
    // The body is spent: openapi-fetch parsed it into `error` before handing
    // the response back, so it is passed in rather than read again.
    throw normalizeError(response, error ?? null);
  }
  return data as T;
}

export type { ApiError };
