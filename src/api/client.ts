import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { useAuthStore } from '@/store/auth';
import { adminBase, apiBase } from '@/lib/base';
import { normalizeError, type ApiError } from './errors';

const REFRESH_PATH = '/api/auth/refresh';
const LOGIN_PATH = '/api/auth/login';

/**
 * Single in-flight refresh. Concurrent 401s await the same promise so we
 * never fire parallel refreshes (BRD §9 — mutex around refresh).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function runRefresh(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return false;
  }
  try {
    const res = await fetch(`${apiBase}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clear();
      return false;
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    clear();
    return false;
  }
}

function ensureRefresh(): Promise<boolean> {
  refreshInFlight ??= runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const authMiddleware: Middleware = {
  async onRequest({ request, schemaPath }) {
    if (schemaPath === REFRESH_PATH || schemaPath === LOGIN_PATH) return request;
    const token = useAuthStore.getState().accessToken;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },

  async onResponse({ request, response, schemaPath }) {
    if (
      response.status !== 401 ||
      schemaPath === REFRESH_PATH ||
      schemaPath === LOGIN_PATH ||
      request.headers.get('x-retried') === '1'
    ) {
      return response;
    }

    const ok = await ensureRefresh();
    if (!ok) {
      // Hard logout — let the router send the user to the login screen.
      if (!location.pathname.endsWith('/login')) {
        window.location.assign(`${adminBase}/login`);
      }
      return response;
    }

    const token = useAuthStore.getState().accessToken;
    const retry = new Request(request, {});
    retry.headers.set('Authorization', `Bearer ${token}`);
    retry.headers.set('x-retried', '1');
    return fetch(retry);
  },
};

export const api = createClient<paths>({ baseUrl: apiBase });
api.use(authMiddleware);

/**
 * Thin wrapper that throws a normalized {@link ApiError} on failure so call
 * sites can `try/catch` uniformly. Returns the parsed data on success.
 */
export async function call<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (error !== undefined || !response.ok) {
    throw await normalizeError(response);
  }
  return data as T;
}

export type { ApiError };
