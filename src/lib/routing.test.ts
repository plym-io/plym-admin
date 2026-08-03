import { describe, expect, it } from 'vitest';
import { normalizeGuide, normalizePlacement, normalizeRouting } from './routing';

describe('normalizeRouting', () => {
  const raw = {
    placement: { host: 'client.com', prefix: '/blog' },
    recommended: { gateway: 'cloudflare', strategy: 'worker' },
    gateways: [
      {
        id: 'cloudflare',
        label: 'Cloudflare',
        strategies: [
          { id: 'worker', label: 'Worker', applicable: true, recommended: true },
          {
            id: 'path-proxy',
            label: 'Path proxy',
            applicable: false,
            blocked_reason: 'Your blog is at the domain root, so there is no path to match.',
          },
        ],
      },
    ],
  };

  it('keeps the gateway, its strategies and why one is blocked', () => {
    const routing = normalizeRouting(raw);
    expect(routing.placement).toEqual({ host: 'client.com', prefix: '/blog', url: undefined });
    expect(routing.recommended).toEqual({ gateway: 'cloudflare', strategy: 'worker' });
    expect(routing.gateways[0].strategies[1]).toMatchObject({
      id: 'path-proxy',
      applicable: false,
      blocked_reason: expect.stringContaining('domain root'),
    });
  });

  it('only blocks a strategy that says so — a missing flag is not a no', () => {
    const routing = normalizeRouting({ gateways: [{ id: 'nginx', strategies: [{ id: 'subdomain' }] }] });
    expect(routing.gateways[0].strategies[0].applicable).toBe(true);
  });

  it('names a gateway from its id when the release sends no label', () => {
    const routing = normalizeRouting({ gateways: [{ id: 'aws-cloudfront' }] });
    expect(routing.gateways[0].label).toBe('Aws Cloudfront');
  });

  it('accepts gateways sent as an id → entry map', () => {
    const routing = normalizeRouting({ gateways: { nginx: { label: 'nginx' } } });
    expect(routing.gateways.map((g) => g.id)).toEqual(['nginx']);
  });

  it('returns an empty catalogue rather than throwing on junk', () => {
    expect(normalizeRouting(null).gateways).toEqual([]);
  });
});

describe('normalizeGuide', () => {
  it('keeps steps, snippets, checks and caveats verbatim', () => {
    const guide = normalizeGuide(
      {
        gateway: { id: 'nginx', label: 'nginx' },
        strategies: [
          {
            id: 'path-proxy',
            label: 'Path proxy',
            requires: ['Access to your nginx config'],
            steps: [
              {
                title: 'Add a location block',
                body: 'Inside the server block for client.com',
                snippet: 'location /blog/ {\n  proxy_pass https://acme.plym.app/blog/;\n}',
                actor: 'customer',
              },
            ],
            checks: [{ command: 'curl -I https://client.com/blog/', expect: '200 OK' }],
            caveats: ['Cache your CDN edge for at least 60s.'],
          },
        ],
      },
      'nginx',
    );
    expect(guide.label).toBe('nginx');
    expect(guide.strategies[0].steps[0].snippet).toContain('proxy_pass');
    expect(guide.strategies[0].checks[0].expect).toBe('200 OK');
    expect(guide.strategies[0].caveats).toHaveLength(1);
  });

  it('handles a single-strategy answer that has no strategies array', () => {
    const guide = normalizeGuide(
      { id: 'subdomain', label: 'Subdomain', steps: [{ title: 'Add a CNAME' }] },
      'cloudflare',
    );
    expect(guide.gateway).toBe('cloudflare');
    expect(guide.strategies).toHaveLength(1);
    expect(guide.strategies[0].steps[0].title).toBe('Add a CNAME');
  });
});

describe('normalizePlacement', () => {
  it('reads the hostname under any of its names', () => {
    expect(normalizePlacement({ hostname: 'client.com' })?.host).toBe('client.com');
  });

  it('keeps an empty prefix — a root-mounted blog has one', () => {
    expect(normalizePlacement({ host: 'client.com', prefix: '' })?.prefix).toBe('');
  });
});
