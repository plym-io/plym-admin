import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/base', () => ({
  adminBase: '/blog/plym-admin',
  apiBase: '/blog',
  asset: (n: string) => n,
}));

const freshAccessToken = vi.fn(async () => 'token-1' as string | null);
const renewSession = vi.fn(async () => false);

vi.mock('@/api/client', () => ({
  freshAccessToken: () => freshAccessToken(),
  renewSession: () => renewSession(),
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'token-2' }) },
}));

interface Call {
  url: string;
  auth: string | null;
}

function stubFetch(byPath: Record<string, () => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get('Authorization') });
      const match = Object.entries(byPath).find(([path]) => url.endsWith(path));
      return match ? match[1]() : new Response('', { status: 404 });
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const SPEC = { openapi: '3.1.0', paths: { '/api/posts': { get: {} } } };

/** The SPA's index.html, which the server returns for any unknown path. */
const INDEX_HTML = () =>
  new Response('<!doctype html><html></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });

async function load() {
  vi.resetModules();
  return import('./openapi-source');
}

beforeEach(() => {
  freshAccessToken.mockResolvedValue('token-1');
  renewSession.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('fetchSpec', () => {
  it('asks the authenticated route first, alongside the panel', async () => {
    const calls = stubFetch({ '/blog/api/openapi.json': () => json(SPEC) });
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/blog/api/openapi.json');
  });

  it('sends the bearer token — the route is not public', async () => {
    // Regression: plym's /api/openapi.json is behind current_user. An
    // anonymous fetch 401s and the screen falls all the way through to
    // "no document published" on a deployment that has one.
    const calls = stubFetch({ '/blog/api/openapi.json': () => json(SPEC) });
    const { fetchSpec } = await load();

    await fetchSpec();
    expect(calls[0].auth).toBe('Bearer token-1');
  });

  it('retries once behind a refresh when the token is spent', async () => {
    let first = true;
    const calls = stubFetch({
      '/blog/api/openapi.json': () => {
        if (first) {
          first = false;
          return json({ detail: 'Not authenticated' }, 401);
        }
        return json(SPEC);
      },
    });
    renewSession.mockResolvedValue(true);
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.auth)).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('treats 403 as a spent token too, the way plym answers', async () => {
    let first = true;
    stubFetch({
      '/blog/api/openapi.json': () => {
        if (first) {
          first = false;
          return json({ detail: 'Forbidden' }, 403);
        }
        return json(SPEC);
      },
    });
    renewSession.mockResolvedValue(true);
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
  });

  it('falls back to the debug-only route on an older deployment', async () => {
    const calls = stubFetch({
      '/blog/plym-docs/openapi.json': () => json(SPEC),
    });
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
    expect(calls.map((c) => c.url)).toEqual([
      '/blog/api/openapi.json',
      '/blog/openapi.json',
      '/blog/plym-docs/openapi.json',
    ]);
  });

  it('rejects a 200 that is the SPA shell rather than a spec', async () => {
    // A 200 is not proof: unknown paths serve index.html, so accepting the
    // first OK response would render an empty reference and stop looking.
    const calls = stubFetch({
      '/blog/api/openapi.json': INDEX_HTML,
      '/blog/openapi.json': INDEX_HTML,
      '/blog/plym-docs/openapi.json': () => json(SPEC),
    });
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
    expect(calls).toHaveLength(3);
  });

  it('rejects JSON that is well-formed but is not a spec', async () => {
    stubFetch({ '/blog/api/openapi.json': () => json({ detail: 'Not Found' }) });
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toBeNull();
  });

  it('returns null when nothing answers', async () => {
    stubFetch({});
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toBeNull();
  });

  it('keeps looking when a request never lands at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/blog/api/openapi.json')
          ? Promise.reject(new TypeError('Failed to fetch'))
          : json(SPEC),
      ),
    );
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
  });

  it('works signed out, in case the route ever becomes public', async () => {
    freshAccessToken.mockResolvedValue(null);
    const calls = stubFetch({ '/blog/api/openapi.json': () => json(SPEC) });
    const { fetchSpec } = await load();

    await expect(fetchSpec()).resolves.toEqual(SPEC);
    expect(calls[0].auth).toBeNull();
  });
});

describe('isSpec', () => {
  it('requires both openapi and paths', async () => {
    const { isSpec } = await load();
    expect(isSpec(SPEC)).toBe(true);
    expect(isSpec({ openapi: '3.1.0' })).toBe(false);
    expect(isSpec({ paths: {} })).toBe(false);
    expect(isSpec(null)).toBe(false);
    expect(isSpec('nope')).toBe(false);
  });
});
