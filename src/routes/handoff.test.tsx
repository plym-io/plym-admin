import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import Handoff from './handoff';
import { useAuthStore } from '@/store/auth';
import type { CloudError } from '@/api/cloud';
import type { User } from '@/types';

/**
 * Everything here turns on the code being spendable exactly once: the fragment
 * is read before the address bar is cleaned, the redeem is fired once however
 * many times React mounts this, and a refusal is reported in the gateway's own
 * words rather than retried.
 */

const redeemHandoff = vi.fn();

vi.mock('@/api/cloud', () => ({
  redeemHandoff: (...args: unknown[]) => redeemHandoff(...args),
}));

const gatewayError = (status: number, message: string, remedy?: string): CloudError => ({
  code: 'handoff_code',
  message,
  remedy: remedy ?? null,
  status,
  raw: null,
});

const PREVIOUS_USER: User = {
  id: 1,
  email: 'previous@example.com',
  role: 'administrator',
  display_name: 'Previous Owner',
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function arrive(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter initialEntries={['/handoff']}>
      <Routes>
        <Route path="/handoff" element={<Handoff />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
        <Route path="/login" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  redeemHandoff.mockReset();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
  window.history.replaceState(null, '', '/');
});

describe('cloud handoff', () => {
  it('spends the code from the fragment and lands on the dashboard', async () => {
    redeemHandoff.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });

    arrive('#code=one-time');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(redeemHandoff).toHaveBeenCalledWith('one-time');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      isAuthenticated: true,
    });
  });

  it('takes the code out of the address bar before spending it', async () => {
    let hashWhenSent = 'not called';
    redeemHandoff.mockImplementation(() => {
      hashWhenSent = window.location.hash;
      return Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' });
    });

    arrive('#code=one-time');

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(hashWhenSent).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('does not mistake its own second mount for a broken link', async () => {
    // React mounts this page twice under StrictMode, and by the second run the
    // code is gone from the address bar — a page that re-reads it there would
    // call a live sign-in incomplete while the first one is still in flight.
    redeemHandoff.mockImplementation(() => new Promise(() => {}));
    window.location.hash = '#code=one-time';

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/handoff']}>
          <Routes>
            <Route path="/handoff" element={<Handoff />} />
            <Route path="/" element={<h1>Dashboard</h1>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Signing you in');
    expect(redeemHandoff).toHaveBeenCalledTimes(1);
  });

  it('does not inherit the identity of whoever was signed in before', async () => {
    useAuthStore.setState({
      accessToken: 'old',
      refreshToken: 'old-refresh',
      isAuthenticated: true,
      user: PREVIOUS_USER,
    });
    redeemHandoff.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });

    arrive('#code=one-time');

    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('reports a spent link in the gateway’s own words, and signs nobody in', async () => {
    redeemHandoff.mockRejectedValue(
      gatewayError(
        401,
        'This sign-in link is no longer valid.',
        'Open the admin from the plym Cloud console again.',
      ),
    );

    arrive('#code=already-used');

    expect(
      await screen.findByRole('heading', { name: 'This sign-in link is no longer valid.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Open the admin from the plym Cloud console again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plym Cloud console/ })).toHaveAttribute(
      'href',
      'https://cloud.plym.io',
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('asks for a fresh link when the URL carries no code, without calling the gateway', async () => {
    arrive('');

    expect(
      await screen.findByRole('heading', { name: 'This sign-in link is incomplete.' }),
    ).toBeInTheDocument();
    expect(redeemHandoff).not.toHaveBeenCalled();
  });

  it('does not repeat plumbing at someone when the platform predates the handoff', async () => {
    // Verbatim from https://sandbox.plym.space/blog/cloud/handoff on 20 Aug 2026:
    // a gateway without this route hands the redeem to its authenticated
    // catch-all, which answers about bearer tokens.
    redeemHandoff.mockRejectedValue({
      code: 'unauthenticated',
      message: 'No bearer token.',
      remedy: 'Sign in to the admin panel again.',
      status: 401,
      raw: null,
    } satisfies CloudError);

    arrive('#code=one-time');

    expect(
      await screen.findByRole('heading', { name: 'This blog could not complete the sign-in.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bearer token/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cannot redeem sign-in links/)).toBeInTheDocument();
  });

  it('sends someone to the password form when no gateway answers', async () => {
    redeemHandoff.mockRejectedValue(gatewayError(404, 'Not Found'));

    arrive('#code=one-time');

    expect(
      await screen.findByRole('heading', {
        name: 'This blog does not sign in through the plym Cloud console.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('keeps the panel usable when the blog cannot be reached at all', async () => {
    redeemHandoff.mockRejectedValue(new TypeError('Failed to fetch'));

    arrive('#code=one-time');

    expect(
      await screen.findByRole('heading', {
        name: 'Could not reach this blog to finish signing you in.',
      }),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('says it is working while the gateway has not answered', async () => {
    redeemHandoff.mockImplementation(() => new Promise(() => {}));

    arrive('#code=one-time');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Signing you in'));
  });
});
