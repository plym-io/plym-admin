import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OpProgress } from './OpProgress';
import type { EventPage } from '@/types/cloud';

/**
 * What this screen does when the blog goes quiet underneath it.
 *
 * A reroute restarts the container and then republishes the panel and the
 * gateway under a different prefix, so the path being polled here answers 5xx
 * for around twenty seconds and then 404s for good. Telling those two apart is
 * the whole job: one is a deploy in progress, the other is a deploy that has
 * already moved somewhere else. Reporting either as a failure is a lie, and
 * reporting the second one as a failure is the lie that used to greet everyone
 * who changed their blog's address.
 */

const getOpEvents = vi.fn();

vi.mock('@/api/cloud', () => ({
  getOpEvents: (...args: unknown[]) => getOpEvents(...args),
}));

/** The shape `@/api/errors` normalizes every gateway answer into. */
const httpError = (status: number, message: string) => ({
  code: `http.${status}`,
  message,
  status,
  raw: null,
});

const page = (state: string, events: Record<string, unknown>[] = []): EventPage => ({
  op_id: 'op-1',
  events,
  next_after: events.length,
  state,
});

beforeEach(() => {
  vi.useFakeTimers();
  getOpEvents.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Poll intervals, with the promises they kick off allowed to settle and the
 * renders that follow allowed to land. The last update of a run has nothing
 * after it to flush it, so the whole advance goes inside `act`.
 */
const poll = (times = 1) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(times * 1000);
  });

describe('OpProgress following a gateway that moves', () => {
  it('picks the operation back up at the new mount when the old one 404s', async () => {
    getOpEvents.mockImplementation((_id: string, _after: number, base?: string) =>
      base === undefined
        ? Promise.reject(httpError(404, 'Not Found'))
        : Promise.resolve(page('succeeded', [{ message: 'republished at /news' }])),
    );
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} followTo="/news/cloud" />);
    await poll(3);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('succeeded');
    // Re-read from the first event: the log survives the move whole, so it is
    // asked for again rather than stitched onto what we already had.
    expect(getOpEvents).toHaveBeenCalledWith('op-1', 0, '/news/cloud');
    expect(screen.getByText('republished at /news')).toBeInTheDocument();
  });

  it('says it is following rather than leaving the log to look stalled', async () => {
    getOpEvents.mockImplementation((_id: string, _after: number, base?: string) =>
      base === undefined
        ? Promise.reject(httpError(404, 'Not Found'))
        : Promise.resolve(page('running')),
    );

    render(<OpProgress opId="op-1" followTo="/news/cloud" />);
    await poll(3);

    expect(screen.getByText(/moved to its new address/i)).toBeInTheDocument();
  });

  it('reads a failure at the new mount as a failure, not a success', async () => {
    getOpEvents.mockImplementation((_id: string, _after: number, base?: string) =>
      base === undefined
        ? Promise.reject(httpError(404, 'Not Found'))
        : Promise.resolve(page('failed', [{ message: 'render failed', level: 'error' }])),
    );
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} followTo="/news/cloud" />);
    await poll(3);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('failed');
  });
});

describe('OpProgress waiting out a restart', () => {
  it('keeps polling the same mount through a 5xx window far longer than a few tries', async () => {
    let calls = 0;
    getOpEvents.mockImplementation((_id: string, _after: number, base?: string) => {
      calls += 1;
      if (calls <= 25) return Promise.reject(httpError(502, 'Bad Gateway'));
      expect(base).toBeUndefined();
      return Promise.resolve(page('succeeded', [{ message: 'done' }]));
    });
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} followTo="/news/cloud" />);
    await poll(30);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('succeeded');
  });

  it('names the restart while it waits', async () => {
    getOpEvents.mockRejectedValue(httpError(502, 'Bad Gateway'));

    render(<OpProgress opId="op-1" followTo="/news/cloud" />);
    await poll(3);

    expect(screen.getByText(/restarting/i)).toBeInTheDocument();
  });

  /* A 5xx is never evidence the gateway moved — following it would abandon the
     mount that is about to come back. */
  it('does not follow a restart to the new mount', async () => {
    getOpEvents.mockRejectedValue(httpError(502, 'Bad Gateway'));

    render(<OpProgress opId="op-1" followTo="/news/cloud" />);
    await poll(30);

    expect(getOpEvents).not.toHaveBeenCalledWith('op-1', expect.anything(), '/news/cloud');
  });
});

describe('OpProgress giving up', () => {
  it('reports the operation lost, not failed, once it has been quiet long enough', async () => {
    getOpEvents.mockRejectedValue(httpError(502, 'Bad Gateway'));
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} />);
    await poll(95);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('lost');
    expect(screen.getByText('Deploy interrupted')).toBeInTheDocument();
  });

  it('gives up on a 404 with nowhere to follow to', async () => {
    getOpEvents.mockRejectedValue(httpError(404, 'Not Found'));
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} />);
    await poll(95);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('lost');
  });

  it('gives up rather than following twice when the new mount is gone too', async () => {
    getOpEvents.mockRejectedValue(httpError(404, 'Not Found'));
    const onSettled = vi.fn();

    render(<OpProgress opId="op-1" onSettled={onSettled} followTo="/news/cloud" />);
    await poll(95);

    expect(onSettled).toHaveBeenCalledExactlyOnceWith('lost');
    expect(getOpEvents).toHaveBeenCalledWith('op-1', 0, '/news/cloud');
  });
});
