import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { normalizeGuide } from '@/lib/routing';
import type { Gateway, GuideStrategy } from '@/types/cloud';
import { ConnectGuide, StrategyChoice } from './ConnectGuide';
import { GatewayPicker } from './GatewayPicker';

function strategy(over: Partial<GuideStrategy> & { id: string }): GuideStrategy {
  return {
    kind: 'subdomain',
    label: over.id,
    applicable: true,
    steps: [],
    checks: [],
    requires: [],
    caveats: [],
    docs: [],
    register_hostname: false,
    ...over,
  };
}

/**
 * Nine gateways went from one way of connecting to two when every gateway
 * gained a subdomain recipe, so several of these now reach a picker that never
 * used to render for them.
 */
describe('StrategyChoice', () => {
  it('offers the choice once a gateway has two ways that fit', async () => {
    const onSelect = vi.fn();
    render(
      <StrategyChoice
        strategies={[
          strategy({ id: 'path-proxy', label: 'Path proxy', summary: 'Serve it under a folder.' }),
          strategy({ id: 'subdomain', label: 'Subdomain', summary: 'One CNAME record.' }),
        ]}
        selected="path-proxy"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText(/more than one way/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /path proxy/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /subdomain/i }));
    expect(onSelect).toHaveBeenCalledWith('subdomain');
  });

  it('stays out of the way when the address leaves only one', () => {
    const { container } = render(
      <StrategyChoice
        strategies={[strategy({ id: 'subdomain', label: 'Subdomain' })]}
        selected="subdomain"
        onSelect={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Cloudflare's three ways are two path proxies and a subdomain, and only the
   * subdomain changes the address readers type. The titles don't say that; the
   * catalogue's `kinds` do.
   */
  const KINDS = [
    {
      id: 'path-proxy',
      label: 'Path proxy',
      summary: 'The gateway forwards a path prefix on your own domain to plym.',
    },
    {
      id: 'subdomain',
      label: 'Subdomain',
      summary: 'The blog is served on its own hostname pointed at plym.',
    },
  ];

  const CLOUDFLARE = [
    strategy({ id: 'worker', kind: 'path-proxy', label: 'Proxy /blog with a Worker' }),
    strategy({ id: 'origin-rule', kind: 'path-proxy', label: 'Proxy /blog with an Origin Rule' }),
    strategy({ id: 'subdomain', kind: 'subdomain', label: 'Serve the blog at blog.plym.io' }),
  ];

  it('tags each way with the family it belongs to', () => {
    render(
      <StrategyChoice
        strategies={CLOUDFLARE}
        kinds={KINDS}
        selected="worker"
        onSelect={vi.fn()}
      />,
    );
    // Two tags plus one legend entry for the proxies; one of each for the rest.
    expect(screen.getAllByText('Path proxy')).toHaveLength(3);
    expect(screen.getAllByText('Subdomain')).toHaveLength(2);
  });

  it('explains the families when the choice actually spans two of them', () => {
    render(
      <StrategyChoice
        strategies={CLOUDFLARE}
        kinds={KINDS}
        selected="worker"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/own hostname pointed at plym/)).toBeInTheDocument();
    expect(screen.getByText(/forwards a path prefix/)).toBeInTheDocument();
  });

  it('says nothing about families when every option is the same one', () => {
    // Two ways to proxy a path don't need a paragraph about proxying paths.
    render(
      <StrategyChoice
        strategies={CLOUDFLARE.slice(0, 2)}
        kinds={KINDS}
        selected="worker"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText(/forwards a path prefix/)).not.toBeInTheDocument();
  });

  it('drops the tags rather than breaking on a gateway that sends no kinds', () => {
    render(
      <StrategyChoice strategies={CLOUDFLARE} selected="worker" onSelect={vi.fn()} />,
    );
    expect(screen.queryByText('Path proxy')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Worker/ })).toBeInTheDocument();
  });
});

describe('GatewayPicker', () => {
  /**
   * `applicable` is the gateway's own verdict across all its strategies, so a
   * blocked path proxy no longer takes the whole gateway down with it.
   */
  it('keeps a gateway usable when only one of its strategies is blocked', () => {
    const gateway: Gateway = {
      id: 'nginx',
      label: 'nginx',
      category: 'web-server',
      applicable: true,
      docs: [],
      strategies: [
        {
          id: 'path-proxy',
          label: 'Path proxy',
          applicable: false,
          blocked_reason: 'You asked for a subdomain, so there is no path to match.',
        },
        { id: 'subdomain', label: 'Subdomain', applicable: true },
      ],
    };

    render(
      <GatewayPicker gateways={[gateway]} selected={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /nginx/i })).toBeEnabled();
  });

  const gateway = (id: string, category: string): Gateway => ({
    id,
    label: id,
    category,
    applicable: true,
    docs: [],
    strategies: [{ id: 'subdomain', kind: 'subdomain', label: 'Subdomain', applicable: true }],
  });

  /**
   * For a path on a domain the catalogue has never seen, it answers with
   * `recommended.gateway: null` and a `why` that says what to do about it. That
   * sentence used to hang off the suggestion card, so the one payload that has
   * nothing else to offer rendered no guidance at all.
   */
  it('shows the reason even when the payload names no gateway', () => {
    render(
      <GatewayPicker
        gateways={[gateway('nginx', 'web-server'), gateway('caddy', 'web-server')]}
        selected={null}
        recommended={null}
        why="/blog is a path on plym.io. Pick the gateway that serves plym.io today."
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/Pick the gateway that serves plym\.io today/)).toBeInTheDocument();
  });

  it('does not repeat the reason once it has a card to sit under', () => {
    render(
      <GatewayPicker
        gateways={[gateway('nginx', 'web-server'), gateway('caddy', 'web-server')]}
        selected={null}
        recommended="nginx"
        why="Because nginx already serves it."
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Because nginx already serves it/)).toHaveLength(1);
  });

  it('names the plym category rather than title-casing the brand', () => {
    render(
      <GatewayPicker gateways={[gateway('plym', 'plym')]} selected={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Without a gateway')).toBeInTheDocument();
    expect(screen.queryByText('Plym')).not.toBeInTheDocument();
  });
});

describe('ConnectGuide', () => {
  it('says why a way of connecting is out, in the gateway’s own words', () => {
    render(
      <ConnectGuide
        strategy={strategy({
          id: 'path-proxy',
          applicable: false,
          blocked_reason: 'You asked for a subdomain, so there is no path to match.',
        })}
      />,
    );
    expect(screen.getByText(/no path to match/)).toBeInTheDocument();
  });

  /**
   * There are no `actor=plym` steps in the catalogue and a server-side test
   * keeps it that way, so the panel that announced them is gone — including for
   * a payload that still carries the field.
   */
  it('renders no "plym handles the rest" panel', () => {
    const guide = normalizeGuide({
      strategies: [
        {
          id: 'subdomain',
          title: 'Subdomain',
          applicable: true,
          steps: [{ title: 'Add a CNAME record', actor: 'customer' }],
          platform: [{ title: 'Certificate', detail: 'Ordered for you', actor: 'plym' }],
        },
      ],
    });

    render(<ConnectGuide strategy={guide.strategies[0]} />);

    expect(screen.getByText('Add a CNAME record')).toBeInTheDocument();
    expect(screen.queryByText(/plym handles the rest/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificate/)).not.toBeInTheDocument();
  });
});
