import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/base', () => ({
  adminBase: '/blog/plym-admin',
  apiBase: '/blog',
  asset: (n: string) => n,
}));

function stubFetch(byUrl: Record<string, Response | (() => Response)>) {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      const match = Object.entries(byUrl).find(([path]) => url.endsWith(path));
      if (!match) return new Response('', { status: 404 });
      const answer = match[1];
      return typeof answer === 'function' ? answer() : answer;
    }),
  );
  return seen;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function detect() {
  vi.resetModules();
  const { detectEdition } = await import('./cloud');
  return detectEdition();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectEdition', () => {
  it('asks the gateway alongside the panel, not at the origin root', async () => {
    const seen = stubFetch({ '/blog/cloud/capabilities': json({ routing: true }) });
    await detect();
    expect(seen[0]).toContain('/blog/cloud/capabilities');
  });

  it('is cloud when capabilities answers, and keeps the flags', async () => {
    stubFetch({ '/blog/cloud/capabilities': json({ routing: true, analytics: false }) });
    expect(await detect()).toEqual({
      edition: 'cloud',
      capabilities: { routing: true, analytics: false },
    });
  });

  it('is OSS only when the gateway 404s twice', async () => {
    const seen = stubFetch({});
    expect(await detect()).toEqual({ edition: 'oss', capabilities: null });
    // /capabilities, then /health — a gateway too old for the first still counts.
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('/cloud/health');
  });

  it('counts an older gateway with no /capabilities as cloud', async () => {
    stubFetch({ '/blog/cloud/health': json({ ok: true }) });
    expect(await detect()).toEqual({ edition: 'cloud', capabilities: null });
  });

  it('counts a gateway that is up but unwell as cloud, not OSS', async () => {
    // 503 while the platform boots must not demote the blog to self-hosted.
    stubFetch({ '/blog/cloud/capabilities': json({ kind: 'not_ready' }, 503) });
    expect(await detect()).toEqual({ edition: 'cloud', capabilities: null });
  });

  it('leaves the edition undecided when the probe never lands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await detect()).toEqual({ edition: null, capabilities: null });
  });

  it('treats an unreadable capabilities body as cloud with no flags', async () => {
    stubFetch({
      '/blog/cloud/capabilities': new Response('<html>hi</html>', { status: 200 }),
    });
    expect(await detect()).toEqual({ edition: 'cloud', capabilities: {} });
  });
});
