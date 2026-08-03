import { describe, expect, it } from 'vitest';
import { normalizeGuide, normalizePlacement, normalizeRouting, normalizeSnippet } from './routing';

describe('normalizeRouting', () => {
  const raw = {
    placement: {
      slug: 'acme',
      origin_host: 'acme.plym.space',
      origin_url: 'https://acme.plym.space',
      platform_domain: 'plym.space',
      public_host: 'www.acme.com',
      public_url: 'https://www.acme.com/blog',
      prefix: '/blog',
      external_domain: true,
      destination: true,
      at_root: false,
    },
    recommended: { gateway: 'cloudflare', strategy: 'worker', why: 'Your DNS is already there.' },
    kinds: [{ id: 'path-proxy', label: 'Path proxy', summary: 'Serve it under a folder.' }],
    gateways: [
      {
        id: 'cloudflare',
        name: 'Cloudflare',
        category: 'cdn',
        summary: 'Proxy the path at the edge.',
        applicable: true,
        docs: [{ title: 'Workers', url: 'https://developers.cloudflare.com/workers/' }],
        strategies: [
          { id: 'worker', kind: 'front-door', title: 'Worker', support: 'supported', applicable: true },
          {
            id: 'path-proxy',
            kind: 'path-proxy',
            title: 'Path proxy',
            support: 'advanced',
            applicable: false,
            blocked_reason: 'Your address is at the domain root, so there is no path to match.',
          },
        ],
      },
    ],
  };

  it('reads the gateway under its new names and keeps its category', () => {
    const routing = normalizeRouting(raw);
    expect(routing.gateways[0]).toMatchObject({
      id: 'cloudflare',
      label: 'Cloudflare',
      category: 'cdn',
      applicable: true,
    });
    expect(routing.gateways[0].docs[0].url).toContain('cloudflare.com');
  });

  it('keeps the recommendation, its reason and why a strategy is blocked', () => {
    const routing = normalizeRouting(raw);
    expect(routing.recommended).toEqual({
      gateway: 'cloudflare',
      strategy: 'worker',
      why: 'Your DNS is already there.',
    });
    expect(routing.gateways[0].strategies[1]).toMatchObject({
      id: 'path-proxy',
      kind: 'path-proxy',
      label: 'Path proxy',
      applicable: false,
      blocked_reason: expect.stringContaining('domain root'),
    });
    expect(routing.kinds[0].label).toBe('Path proxy');
  });

  it('still reads a release that spells them label and description', () => {
    const routing = normalizeRouting({
      gateways: [{ id: 'nginx', label: 'nginx', description: 'Roll your own.' }],
    });
    expect(routing.gateways[0]).toMatchObject({ label: 'nginx', summary: 'Roll your own.' });
  });

  it('only blocks a strategy that says so — a missing flag is not a no', () => {
    const routing = normalizeRouting({ gateways: [{ id: 'nginx', strategies: [{ id: 'subdomain' }] }] });
    expect(routing.gateways[0].strategies[0].applicable).toBe(true);
  });

  it('falls back to its strategies when a gateway carries no applicable flag', () => {
    const routing = normalizeRouting({
      gateways: [
        { id: 'shopify', strategies: [{ id: 'subdomain', applicable: false }] },
        { id: 'nginx', strategies: [{ id: 'path-proxy', applicable: false }, { id: 'sub' }] },
      ],
    });
    expect(routing.gateways[0].applicable).toBe(false);
    expect(routing.gateways[1].applicable).toBe(true);
  });

  it('names a gateway from its id when the release sends no name', () => {
    const routing = normalizeRouting({ gateways: [{ id: 'aws-cloudfront' }] });
    expect(routing.gateways[0].label).toBe('Aws Cloudfront');
  });

  it('accepts gateways sent as an id → entry map', () => {
    const routing = normalizeRouting({ gateways: { nginx: { name: 'nginx' } } });
    expect(routing.gateways.map((g) => g.id)).toEqual(['nginx']);
  });

  it('returns an empty catalogue rather than throwing on junk', () => {
    expect(normalizeRouting(null).gateways).toEqual([]);
    expect(normalizeRouting(null).kinds).toEqual([]);
  });
});

describe('normalizeSnippet', () => {
  it('keeps the label, language and filename off an object snippet', () => {
    expect(
      normalizeSnippet({
        label: 'Server block',
        language: 'nginx',
        filename: '/etc/nginx/sites-enabled/acme',
        body: 'proxy_pass https://acme.plym.space;',
      }),
    ).toEqual({
      label: 'Server block',
      language: 'nginx',
      filename: '/etc/nginx/sites-enabled/acme',
      body: 'proxy_pass https://acme.plym.space;',
    });
  });

  it('still accepts a bare string, as older releases sent', () => {
    expect(normalizeSnippet('dig blog.acme.com')?.body).toBe('dig blog.acme.com');
  });

  it('drops a snippet with nothing to paste', () => {
    expect(normalizeSnippet({ label: 'Empty' })).toBeNull();
    expect(normalizeSnippet('   ')).toBeNull();
    expect(normalizeSnippet(null)).toBeNull();
  });
});

describe('normalizeGuide', () => {
  const guide = normalizeGuide(
    {
      gateway: {
        id: 'nginx',
        name: 'nginx',
        category: 'web-server',
        summary: 'The classic reverse proxy.',
        docs: [{ title: 'proxy_pass', url: 'https://nginx.org/' }],
      },
      placement: { origin_host: 'acme.plym.space', destination: true },
      contract: ['Forward the Host header unchanged.'],
      strategies: [
        {
          id: 'path-proxy',
          kind: 'path-proxy',
          title: 'Path proxy',
          support: 'supported',
          applicable: true,
          requires: ['Access to your nginx config'],
          steps: [
            {
              title: 'Add a location block',
              detail: 'Inside the server block for acme.com',
              actor: 'customer',
              snippet: {
                label: 'nginx',
                language: 'nginx',
                filename: '/etc/nginx/conf.d/acme.conf',
                body: 'location /blog/ {\n  proxy_pass https://acme.plym.space/blog/;\n}',
              },
            },
          ],
          platform: [{ title: 'Certificate', detail: 'Ordered for you', actor: 'plym' }],
          finish: {
            title: 'Point plym at it',
            detail: 'We rewrite every URL for the new address.',
            home: 'https://acme.com/blog',
            register_hostname: false,
          },
          checks: [{ command: 'curl -I https://acme.com/blog/', expect: '200 OK' }],
          caveats: ['Cache your CDN edge for at least 60s.'],
          docs: [{ title: 'nginx docs', url: 'https://nginx.org/en/docs/' }],
          register_hostname: false,
        },
      ],
    },
    'nginx',
  );

  it('keeps the gateway identity, contract and docs', () => {
    expect(guide).toMatchObject({ gateway: 'nginx', label: 'nginx', category: 'web-server' });
    expect(guide.contract).toEqual(['Forward the Host header unchanged.']);
    expect(guide.docs[0].title).toBe('proxy_pass');
    expect(guide.placement?.destination).toBe(true);
  });

  it('reads a step under detail and keeps its snippet whole', () => {
    const step = guide.strategies[0].steps[0];
    expect(step.detail).toContain('server block');
    expect(step.snippet?.body).toContain('proxy_pass');
    expect(step.snippet?.filename).toBe('/etc/nginx/conf.d/acme.conf');
  });

  it("separates plym's work from the owner's", () => {
    expect(guide.strategies[0].steps.every((s) => s.actor !== 'plym')).toBe(true);
    expect(guide.strategies[0].platform[0].title).toBe('Certificate');
  });

  it('carries the finish through, since it is what closes the flow', () => {
    expect(guide.strategies[0].finish).toMatchObject({
      home: 'https://acme.com/blog',
      register_hostname: false,
    });
    expect(guide.strategies[0].checks[0].expect).toBe('200 OK');
    expect(guide.strategies[0].caveats).toHaveLength(1);
  });

  it('drops a finish with no address to apply', () => {
    const g = normalizeGuide({
      strategies: [{ id: 'native', steps: [], finish: { title: 'Nothing to do' } }],
    });
    expect(g.strategies[0].finish).toBeNull();
  });

  it('takes register_hostname from the finish when the strategy omits it', () => {
    const g = normalizeGuide({
      strategies: [
        {
          id: 'subdomain',
          steps: [],
          finish: { home: 'https://blog.acme.com', register_hostname: true },
        },
      ],
    });
    expect(g.strategies[0].register_hostname).toBe(true);
  });

  it('handles a single-strategy answer that has no strategies array', () => {
    const g = normalizeGuide(
      { id: 'subdomain', title: 'Subdomain', steps: [{ title: 'Add a CNAME' }] },
      'cloudflare',
    );
    expect(g.gateway).toBe('cloudflare');
    expect(g.strategies).toHaveLength(1);
    expect(g.strategies[0].steps[0].title).toBe('Add a CNAME');
  });
});

describe('normalizePlacement', () => {
  it('reads the public hostname under any of its names', () => {
    expect(normalizePlacement({ hostname: 'acme.com' })?.public_host).toBe('acme.com');
    expect(normalizePlacement({ public_host: 'acme.com' })?.public_host).toBe('acme.com');
  });

  it('keeps an empty prefix — a root-mounted blog has one', () => {
    expect(normalizePlacement({ public_host: 'acme.com', prefix: '' })?.prefix).toBe('');
  });

  it('keeps the flags the screen branches on', () => {
    expect(normalizePlacement({ external_domain: false, at_root: true })).toMatchObject({
      external_domain: false,
      at_root: true,
    });
  });
});
