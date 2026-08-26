import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { User } from '@/types';

/**
 * Root is the account plym Cloud's console signs a handoff in as. plym itself
 * knows it only as an administrator, so the gateway has to say which one it is
 * — and the panel may only act on an answer it actually got.
 */

const cloud = vi.hoisted(() => ({
  detectEdition: vi.fn(),
  rootUser: vi.fn(),
}));

vi.mock('@/api/cloud', () => cloud);

const user = (id: number, email: string, over: Partial<User> = {}): User => ({
  id,
  email,
  role: 'administrator',
  display_name: email.split('@')[0],
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
});

const ROOT = user(1, 'root@acme.com', { display_name: 'Administrator' });
const HUMAN = user(2, 'sam@acme.com', { display_name: 'Sam Rivera' });

vi.mock('@/api/client', () => ({
  api: { GET: vi.fn(() => Promise.resolve({})), POST: vi.fn(), DELETE: vi.fn() },
  call: vi.fn(() => Promise.resolve({ items: [ROOT, HUMAN] })),
}));

/**
 * A fresh module graph per test: both "once" probes memoize at module scope,
 * which is the point of them and the enemy of a shared one.
 */
async function openUsers(capabilities: Record<string, unknown> | null) {
  vi.resetModules();
  cloud.detectEdition.mockResolvedValue({ edition: 'cloud', capabilities });
  const { useAuthStore } = await import('@/store/auth');
  useAuthStore.setState({ user: HUMAN, isAuthenticated: true });
  const { loadRootUserOnce } = await import('@/store/cloud');
  const Users = (await import('./users')).default;
  render(<Users />);
  await screen.findByText('Administrator');
  // The screen starts this lookup on mount; await that same memoized promise
  // rather than polling the DOM for what it will paint.
  await act(async () => {
    await loadRootUserOnce();
  });
}

const rowOf = (name: string) => screen.getByText(name).closest('div')!.parentElement!;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  cloud.rootUser.mockResolvedValue(ROOT.id);
});

describe('a gateway that names Root', () => {
  it('labels that account Root rather than by its plym role', async () => {
    await openUsers({ root: true });

    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(within(rowOf('Administrator')).queryByText('administrator')).toBeNull();
    // Everyone else still reads as what plym says they are.
    expect(within(rowOf('Sam Rivera')).getByText('administrator')).toBeInTheDocument();
  });

  it('keeps the reset-password action off Root, and on everyone else', async () => {
    await openUsers({ root: true });

    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(
      within(rowOf('Administrator')).queryByRole('button', { name: 'Reset password' }),
    ).toBeNull();
    expect(
      within(rowOf('Sam Rivera')).getByRole('button', { name: 'Reset password' }),
    ).toBeInTheDocument();
  });

  it('sends Root to the console that owns its sign-in instead', async () => {
    await openUsers({ root: true });

    const link = within(rowOf('Administrator')).getByRole('link', {
      name: 'Get a sign-in link from plym Cloud',
    });
    // The console's sign-in page: plym Cloud mails a single-use link and has
    // no password to reset, so /forgot no longer exists to point at.
    expect(link).toHaveAttribute('href', 'https://cloud.plym.io/login');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // Everyone else resets in place, so the console link is Root's alone.
    expect(
      within(rowOf('Sam Rivera')).queryByRole('link', { name: /plym Cloud/ }),
    ).toBeNull();
  });

  it('will not let an administrator deactivate the account the console arrives on', async () => {
    await openUsers({ root: true });

    expect(within(rowOf('Administrator')).queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });
});

describe('a blog with no Root to name', () => {
  it('never asks when the gateway does not advertise the route', async () => {
    await openUsers({ settings: {} });

    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(cloud.rootUser).not.toHaveBeenCalled();
    expect(screen.queryByText('Root')).toBeNull();
    expect(
      within(rowOf('Administrator')).getByRole('button', { name: 'Reset password' }),
    ).toBeInTheDocument();
  });

  it('does not ask a self-hosted blog either', async () => {
    await openUsers(null);

    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(cloud.rootUser).not.toHaveBeenCalled();
    expect(screen.queryByText('Root')).toBeNull();
  });

  it('shows no chip when the gateway answers that there is no Root user', async () => {
    // A tenant whose superuser row is missing or deactivated: the route exists
    // and answers null, and a chip nobody can substantiate is not drawn.
    cloud.rootUser.mockResolvedValue(null);
    await openUsers({ root: true });

    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(cloud.rootUser).toHaveBeenCalled();
    expect(screen.queryByText('Root')).toBeNull();
    expect(
      within(rowOf('Administrator')).getByRole('button', { name: 'Reset password' }),
    ).toBeInTheDocument();
  });
});
