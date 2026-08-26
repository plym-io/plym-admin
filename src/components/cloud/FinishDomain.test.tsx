import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FinishDomain } from './FinishDomain';
import type { Finish } from '@/types/cloud';

/**
 * The last step of connecting a domain, and the thing it used to get wrong.
 *
 * An address with a folder in it — `acme.com/blog` — republishes the blog under
 * `/blog`, and this panel is served from under the blog. So the operation this
 * screen starts is the operation that deletes the page it is running on, along
 * with the gateway it polls. The old shape of this component asked the screen
 * behind it to reload the moment that landed, which asked the mount that had
 * just been taken away and painted its 404 over a move that had worked.
 */

const setHome = vi.fn();
const getOpEvents = vi.fn();

vi.mock('@/api/cloud', () => ({
  setHome: (...args: unknown[]) => setHome(...args),
  getOpEvents: (...args: unknown[]) => getOpEvents(...args),
}));

const FINISH: Finish = {
  title: 'Point acme.com/blog at plym',
  home: 'https://acme.com/blog',
  register_hostname: false,
};

const httpError = (status: number, message: string) => ({
  code: `http.${status}`,
  message,
  status,
  raw: null,
});

/** jsdom has no navigation, and this component's whole job is to navigate. */
const replace = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  setHome.mockReset().mockResolvedValue({ op_id: 'op-1', verb: 'set-home', target: null, state: 'queued' });
  getOpEvents.mockReset();
  replace.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, replace, origin: 'http://localhost:3000' },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const poll = (times = 1) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(times * 1000);
  });

const clickMove = async () => {
  const button = screen.getByRole('button', { name: /move my blog/i });
  await act(async () => {
    button.click();
  });
};

describe('FinishDomain when the destination moves the panel', () => {
  it('warns that the panel moves before anything is applied', () => {
    getOpEvents.mockImplementation(() => new Promise(() => {}));
    render(<FinishDomain finish={FINISH} checks={[]} prefix="/blog" onApplied={vi.fn()} />);

    expect(screen.getByText('This admin panel moves too.')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/blog/plym-admin/')).toBeInTheDocument();
  });

  it('hands the owner to the new address instead of reloading the old one', async () => {
    getOpEvents.mockResolvedValue({
      op_id: 'op-1',
      events: [{ message: 'republished at /blog' }],
      next_after: 1,
      state: 'succeeded',
    });
    const onApplied = vi.fn();

    render(<FinishDomain finish={FINISH} checks={[]} prefix="/blog" onApplied={onApplied} />);
    await clickMove();
    await poll(2);

    expect(screen.getByText('Your blog has moved — and this panel with it.')).toBeInTheDocument();
    // The reload this used to fire is the cracked screen: it asks a mount that
    // no longer exists and reports the move as a routing failure.
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('offers the new address rather than an error when it loses the deploy', async () => {
    getOpEvents.mockRejectedValue(httpError(404, 'Not Found'));
    const onApplied = vi.fn();

    render(<FinishDomain finish={FINISH} checks={[]} prefix="/blog" onApplied={onApplied} />);
    await clickMove();
    await poll(95);

    expect(screen.getByText(/lost the deploy/i)).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/blog/plym-admin/')).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    // Not knowing the move landed is exactly why nobody is sent anywhere.
    expect(replace).not.toHaveBeenCalled();
  });

  it('follows the operation to the gateway’s new mount', async () => {
    getOpEvents.mockImplementation((_id: string, _after: number, base?: string) =>
      base === undefined
        ? Promise.reject(httpError(404, 'Not Found'))
        : Promise.resolve({ op_id: 'op-1', events: [], next_after: 0, state: 'succeeded' }),
    );

    render(<FinishDomain finish={FINISH} checks={[]} prefix="/blog" onApplied={vi.fn()} />);
    await clickMove();
    await poll(3);

    expect(getOpEvents).toHaveBeenCalledWith('op-1', 0, '/blog/cloud');
    expect(screen.getByText('Your blog has moved — and this panel with it.')).toBeInTheDocument();
  });
});

describe('FinishDomain when the destination leaves the panel where it is', () => {
  /* A bare subdomain serves the blog at the root, which is where this panel
     already answers. Nothing is taken away, so nothing is warned about and the
     screen reloads exactly as it always did. */
  it('reloads the screen and says nothing about moving', async () => {
    getOpEvents.mockResolvedValue({
      op_id: 'op-1',
      events: [],
      next_after: 0,
      state: 'succeeded',
    });
    const onApplied = vi.fn();
    const finish: Finish = { home: 'https://blog.acme.com', register_hostname: true };

    render(<FinishDomain finish={finish} checks={[]} prefix="" onApplied={onApplied} />);
    expect(screen.queryByText('This admin panel moves too.')).not.toBeInTheDocument();

    await clickMove();
    await poll(2);

    expect(onApplied).toHaveBeenCalled();
    expect(screen.getByText('Your blog lives here now')).toBeInTheDocument();
    expect(screen.queryByText(/this panel with it/i)).not.toBeInTheDocument();
  });

  /* An older gateway that sends no prefix has told us nothing, and inventing a
     move from `finish.home` here would be guessing at the gateway's own job. */
  it('assumes no move when the gateway did not resolve a prefix', async () => {
    getOpEvents.mockResolvedValue({
      op_id: 'op-1',
      events: [],
      next_after: 0,
      state: 'succeeded',
    });
    const onApplied = vi.fn();

    render(<FinishDomain finish={FINISH} checks={[]} onApplied={onApplied} />);
    await clickMove();
    await poll(2);

    expect(onApplied).toHaveBeenCalled();
    expect(screen.queryByText('This admin panel moves too.')).not.toBeInTheDocument();
  });
});
