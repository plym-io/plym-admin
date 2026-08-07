import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Domain from './domain';
import type { Guide, RoutingOptions } from '@/types/cloud';

/**
 * The two shortcuts this screen takes, and the shape of the payload that earns
 * each one.
 *
 * Both are decisions the *gateway* makes — `placement.at_apex` and
 * `placement.subdomain_requested` — so every fixture here is a routing payload
 * and nothing is asserted about hostnames the screen worked out for itself.
 */

const getRouting = vi.fn();
const getGuide = vi.fn();

vi.mock('@/api/cloud', () => ({
  getRouting: (...args: unknown[]) => getRouting(...args),
  getGuide: (...args: unknown[]) => getGuide(...args),
  getStatus: () => Promise.resolve({ url: 'https://acme.plym.space' }),
  setHome: vi.fn(),
  getOpEvents: vi.fn(() => new Promise(() => {})),
}));

/** Where the blog sits before any of this — the call with no `home`. */
const CURRENT: RoutingOptions = {
  placement: {
    slug: 'acme',
    platform_domain: 'plym.space',
    origin_url: 'https://acme.plym.space',
    public_url: 'https://acme.plym.space',
    external_domain: false,
  },
  gateways: [],
  kinds: [],
};

/** `docs.acme.com`: a subdomain they typed, echoed back as itself. */
const BARE_SUBDOMAIN: RoutingOptions = {
  placement: {
    destination: true,
    public_host: 'docs.acme.com',
    public_url: 'https://docs.acme.com/',
    prefix: '',
    at_root: true,
    at_apex: false,
    subdomain_requested: true,
    subdomain_host: 'docs.acme.com',
  },
  gateways: [
    {
      id: 'nginx',
      label: 'nginx',
      category: 'web-server',
      applicable: true,
      docs: [],
      strategies: [
        {
          id: 'path-proxy',
          kind: 'path-proxy',
          label: 'Path proxy',
          applicable: false,
          blocked_reason: 'You asked for a subdomain, so there is no path to match.',
        },
        { id: 'subdomain', kind: 'subdomain', label: 'Subdomain', applicable: true },
      ],
    },
  ],
  kinds: [],
  recommended: { gateway: 'nginx', strategy: 'subdomain', why: 'One CNAME is the whole job.' },
};

/** `acme.com`: nothing to hang a CNAME on, and the gateway says so. */
const APEX: RoutingOptions = {
  placement: {
    destination: true,
    public_host: 'acme.com',
    prefix: '',
    at_root: true,
    at_apex: true,
    subdomain_requested: false,
    subdomain_host: 'blog.acme.com',
  },
  gateways: [
    {
      id: 'nginx',
      label: 'nginx',
      category: 'web-server',
      applicable: true,
      docs: [],
      strategies: [
        {
          id: 'path-proxy',
          kind: 'path-proxy',
          label: 'Path proxy',
          applicable: false,
          blocked_reason: 'There is no path to match at the domain root.',
        },
        { id: 'subdomain', kind: 'subdomain', label: 'Subdomain', applicable: true },
      ],
    },
  ],
  kinds: [],
  recommended: {
    gateway: null,
    why: 'A bare domain cannot hold the record this needs. Serve the blog under a folder like acme.com/blog, or on a subdomain like blog.acme.com.',
  },
};

const SUBDOMAIN_GUIDE: Guide = {
  gateway: 'nginx',
  label: 'nginx',
  docs: [],
  contract: [],
  placement: BARE_SUBDOMAIN.placement,
  strategies: [
    {
      id: 'path-proxy',
      kind: 'path-proxy',
      label: 'Path proxy',
      applicable: false,
      blocked_reason: 'You asked for a subdomain, so there is no path to match.',
      steps: [],
      checks: [],
      requires: [],
      caveats: [],
      docs: [],
      register_hostname: false,
    },
    {
      id: 'subdomain',
      kind: 'subdomain',
      label: 'Subdomain',
      applicable: true,
      steps: [
        {
          title: 'Add a CNAME record',
          detail: 'Wherever docs.acme.com’s DNS lives.',
          snippet: { body: 'docs.acme.com. CNAME acme.plym.space.' },
        },
      ],
      finish: { home: 'https://docs.acme.com/', register_hostname: true },
      checks: [],
      requires: [],
      caveats: [],
      docs: [],
      register_hostname: true,
    },
  ],
};

/** Answer the no-`home` call with current state and any other with `then`. */
function serve(then: RoutingOptions) {
  getRouting.mockImplementation((home?: string) =>
    Promise.resolve(home ? then : CURRENT),
  );
}

async function typeAddress(address: string) {
  const user = userEvent.setup();
  render(<Domain />);
  await screen.findByLabelText('The address you want your blog to have');
  await user.type(screen.getByLabelText('The address you want your blog to have'), address);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  return user;
}

beforeEach(() => {
  getRouting.mockReset();
  getGuide.mockReset();
  getGuide.mockResolvedValue(SUBDOMAIN_GUIDE);
});

describe('a bare subdomain', () => {
  it('skips the gateway question and shows the record itself', async () => {
    serve(BARE_SUBDOMAIN);
    await typeAddress('docs.acme.com');

    expect(await screen.findByText('Add one DNS record')).toBeInTheDocument();
    expect(await screen.findByText('Add a CNAME record')).toBeInTheDocument();
    // The question whose answer would not change a single step.
    expect(screen.queryByText('What runs that domain today?')).not.toBeInTheDocument();
  });

  it('asks for the address that was typed, not one built from it', async () => {
    serve(BARE_SUBDOMAIN);
    await typeAddress('docs.acme.com');

    await waitFor(() => expect(getRouting).toHaveBeenCalledWith('https://docs.acme.com'));
    // The move that used to land on blog.docs.acme.com.
    expect(await screen.findByText('https://docs.acme.com/')).toBeInTheDocument();
  });

  it('puts go-live in the same stage, so a subdomain is two stages', async () => {
    serve(BARE_SUBDOMAIN);
    await typeAddress('docs.acme.com');

    expect(await screen.findByRole('button', { name: /move my blog/i })).toBeInTheDocument();
    expect(screen.queryByText('Go live')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /made these changes/i })).not.toBeInTheDocument();
  });

  it('still opens the gateway picker for anyone who wants it', async () => {
    serve(BARE_SUBDOMAIN);
    const user = await typeAddress('docs.acme.com');

    await user.click(await screen.findByRole('button', { name: /show me the setups/i }));

    expect(await screen.findByText('What runs that domain today?')).toBeInTheDocument();
  });
});

describe('an apex', () => {
  it('leads with the gateway’s reason rather than a picker', async () => {
    serve(APEX);
    await typeAddress('acme.com');

    expect(await screen.findByText(/A bare domain cannot hold the record/)).toBeInTheDocument();
    expect(screen.queryByText('What runs that domain today?')).not.toBeInTheDocument();
  });

  it('offers both ways out as one tap each', async () => {
    serve(APEX);
    await typeAddress('acme.com');

    expect(await screen.findByRole('button', { name: /acme\.com\/blog/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /blog\.acme\.com/ })).toBeInTheDocument();
  });

  it('re-runs against the subdomain it suggested', async () => {
    serve(APEX);
    const user = await typeAddress('acme.com');

    getRouting.mockImplementation((home?: string) =>
      Promise.resolve(home === 'https://blog.acme.com' ? BARE_SUBDOMAIN : APEX),
    );
    await user.click(await screen.findByRole('button', { name: /blog\.acme\.com/ }));

    await waitFor(() => expect(getRouting).toHaveBeenCalledWith('https://blog.acme.com'));
  });

  it('is not a dead end — the catalogue is still one click away', async () => {
    serve(APEX);
    const user = await typeAddress('acme.com');

    await user.click(await screen.findByRole('button', { name: /show the setups anyway/i }));

    expect(await screen.findByText('nginx')).toBeInTheDocument();
  });
});
