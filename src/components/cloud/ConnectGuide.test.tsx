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
