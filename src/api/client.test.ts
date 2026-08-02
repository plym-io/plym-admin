import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/base', () => ({
  adminBase: '/admin',
  apiBase: 'http://api.test',
  asset: (n: string) => n,
}));

/** Responders are consumed in order; each sees the outgoing Request. */
type Responder = (req: Request) => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let calls: Request[] = [];

/**
 * openapi-fetch captures `globalThis.fetch` when the client is created, so the
 * stub has to be installed before `client.ts` is imported.
 */
async function withFetch(responders: Responder[]) {
  const queue = [...responders];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      calls.push(req.clone());
      const next = queue.shift();
      if (!next) throw new Error(`unexpected fetch: ${req.method} ${req.url}`);
      const res = next(req);
      // Real `fetch` drains the request body. Doing the same here is what
      // makes a retry built from the sent Request throw, exactly as it does
      // in the browser — without this the retry path looks fine in tests.
      if (req.body) await req.arrayBuffer();
      return res;
    }),
  );
  vi.resetModules();
  const [client, store] = await Promise.all([
    import('./client'),
    import('@/store/auth'),
  ]);
  store.useAuthStore.setState({
    accessToken: 'old-access',
    refreshToken: 'refresh-1',
    user: null,
    isAuthenticated: true,
  });
  return { ...client, useAuthStore: store.useAuthStore };
}

const UNAUTHORIZED = () => json({ detail: 'Unauthorized' }, 401);
const TOKENS = () =>
  json({ access_token: 'new-access', refresh_token: 'refresh-2' });

/** A JWT-shaped token whose `exp` sits `secs` from now (negative = expired). */
function jwt(secs: number) {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secs }),
  ).replace(/=+$/, '');
  return `header.${payload}.signature`;
}

beforeEach(() => {
  calls = [];
});

describe('auth middleware', () => {
  it('refreshes and retries a GET that 401s, returning the retried data', async () => {
    const { api, call } = await withFetch([
      UNAUTHORIZED,
      TOKENS,
      () => json({ id: 12, title: 'Hello' }),
    ]);

    const post = await call(
      api.GET('/api/posts/{post_id}', { params: { path: { post_id: 12 } } }),
    );

    expect(post).toEqual({ id: 12, title: 'Hello' });
    expect(calls[2].headers.get('Authorization')).toBe('Bearer new-access');
  });

  it('refreshes and retries a PATCH that 401s, preserving the body', async () => {
    const { api, call } = await withFetch([
      UNAUTHORIZED,
      TOKENS,
      () => json({ id: 12, title: 'Updated' }),
    ]);

    const post = await call(
      api.PATCH('/api/posts/{post_id}', {
        params: { path: { post_id: 12 } },
        body: { title: 'Updated' },
      }),
    );

    expect(post).toEqual({ id: 12, title: 'Updated' });
    expect(await calls[2].text()).toBe(JSON.stringify({ title: 'Updated' }));
  });

  it('fires only one refresh for concurrent 401s', async () => {
    const { api, call } = await withFetch([
      UNAUTHORIZED,
      UNAUTHORIZED,
      TOKENS,
      () => json([]),
      () => json([]),
    ]);

    await Promise.all([call(api.GET('/api/posts')), call(api.GET('/api/media'))]);

    const refreshes = calls.filter((c) => c.url.endsWith('/api/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });
});

describe('a refresh that fails', () => {
  it('keeps the session when the refresh endpoint is unreachable', async () => {
    const { api, call, useAuthStore } = await withFetch([
      UNAUTHORIZED,
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]);

    await expect(call(api.GET('/api/posts'))).rejects.toMatchObject({
      status: 401,
    });

    // A dropped connection must not cost the user their session — and with it
    // whatever draft they have open.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
  });

  it('clears the session when the refresh token is rejected', async () => {
    // The hard logout also calls location.assign — jsdom logs a "navigation
    // not implemented" notice for it, which is expected here.
    const { api, call, useAuthStore } = await withFetch([
      UNAUTHORIZED,
      () => json({ detail: 'Invalid refresh token' }, 401),
    ]);

    await expect(call(api.GET('/api/posts'))).rejects.toMatchObject({
      status: 401,
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

describe('expired access token', () => {
  it('renews before sending, so the expired token is never presented', async () => {
    const { api, call, useAuthStore } = await withFetch([
      TOKENS,
      () => json({ id: 12, title: 'Hello' }),
    ]);
    useAuthStore.setState({ accessToken: jwt(-60) });

    const post = await call(
      api.GET('/api/posts/{post_id}', { params: { path: { post_id: 12 } } }),
    );

    expect(post).toEqual({ id: 12, title: 'Hello' });
    expect(calls.map((c) => c.url)).toEqual([
      'http://api.test/api/auth/refresh',
      'http://api.test/api/posts/12',
    ]);
    expect(calls[1].headers.get('Authorization')).toBe('Bearer new-access');
  });

  it('does not depend on the server answering 401 — a 404 reply still had a fresh token', async () => {
    const { api, call, useAuthStore } = await withFetch([
      TOKENS,
      () => json({ detail: 'Not found' }, 404),
    ]);
    useAuthStore.setState({ accessToken: jwt(-60) });

    await expect(
      call(api.GET('/api/posts/{post_id}', { params: { path: { post_id: 12 } } })),
    ).rejects.toMatchObject({ status: 404 });

    // The 404 is the record's own, not a side effect of a stale token.
    expect(calls[1].headers.get('Authorization')).toBe('Bearer new-access');
  });

  it('renews once for a burst of requests that all find the token expired', async () => {
    const { api, call, useAuthStore } = await withFetch([
      TOKENS,
      () => json([]),
      () => json([]),
      () => json([]),
    ]);
    useAuthStore.setState({ accessToken: jwt(-60) });

    await Promise.all([
      call(api.GET('/api/posts')),
      call(api.GET('/api/media')),
      call(api.GET('/api/users')),
    ]);

    expect(calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1);
    for (const c of calls.slice(1)) {
      expect(c.headers.get('Authorization')).toBe('Bearer new-access');
    }
  });

  it('leaves a still-valid token alone', async () => {
    const { api, call, useAuthStore } = await withFetch([() => json([])]);
    const token = jwt(600);
    useAuthStore.setState({ accessToken: token });

    await call(api.GET('/api/posts'));

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('falls back to the 401 path for a token with no readable exp', async () => {
    const { api, call } = await withFetch([
      UNAUTHORIZED,
      TOKENS,
      () => json([]),
    ]);
    // `old-access` from withFetch() is opaque — nothing to pre-empt on.
    await call(api.GET('/api/posts'));

    expect(calls[0].headers.get('Authorization')).toBe('Bearer old-access');
    expect(calls[2].headers.get('Authorization')).toBe('Bearer new-access');
  });
});
