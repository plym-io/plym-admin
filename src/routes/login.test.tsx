import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import Login from './login';
import { useAuthStore } from '@/store/auth';
import { useCloudStore } from '@/store/cloud';
import { useThemeStore } from '@/store/theme';
import type { ApiError } from '@/api/errors';

/**
 * Three things this screen has to keep doing. It shows the panel it opens onto
 * in the theme that panel will be painted in; the reveal control actually
 * changes what the field is; and a refusal costs the typist nothing they had
 * already typed.
 */

const call = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    POST: (path: string, init: { body: unknown }) => ({ path, body: init.body }),
    GET: (path: string) => ({ path }),
  },
  call: (request: unknown) => call(request),
}));

const refused: ApiError = {
  code: 'invalid_credentials',
  message: 'Invalid credentials',
  status: 401,
  raw: null,
};

function arrive() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  call.mockReset();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
  useThemeStore.setState({ preference: 'light', resolved: 'light' });
  useCloudStore.setState({ edition: null, capabilities: null });
});

describe('the product shot', () => {
  const shot = (container: HTMLElement, face: 'light' | 'dark') =>
    container.querySelector(`img[data-shot="${face}"]`);

  it('is the light panel under the light theme', () => {
    const { container } = arrive();
    expect(shot(container, 'light')).toHaveAttribute('data-active', 'true');
    expect(shot(container, 'dark')).toHaveAttribute('data-active', 'false');
  });

  it('is the dark panel under the dark theme', () => {
    useThemeStore.setState({ preference: 'dark', resolved: 'dark' });
    const { container } = arrive();
    expect(shot(container, 'dark')).toHaveAttribute('data-active', 'true');
    expect(shot(container, 'light')).toHaveAttribute('data-active', 'false');
  });

  // Both faces are mounted from first paint so the theme toggle has nothing to
  // download. Dropping to a single element whose `src` follows the theme would
  // still pass the two assertions above and still stall on the first toggle.
  it('mounts both faces whichever theme is on', () => {
    const { container } = arrive();
    expect(shot(container, 'light')).toHaveAttribute('src', expect.stringContaining('home-light'));
    expect(shot(container, 'dark')).toHaveAttribute('src', expect.stringContaining('home-dark'));
  });
});

describe('the password field', () => {
  it('is hidden until the reveal control says otherwise', async () => {
    const user = userEvent.setup();
    arrive();

    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });
});

describe('a refused sign-in', () => {
  it('says so, and keeps what was typed', async () => {
    const user = userEvent.setup();
    call.mockRejectedValue(refused);
    arrive();

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That doesn't look right.",
    );
    expect(screen.getByLabelText('Email')).toHaveValue('admin@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('wrong');
  });

  it('leaves the button usable for the next attempt', async () => {
    const user = userEvent.setup();
    call.mockRejectedValue(refused);
    arrive();

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled(),
    );
  });
});

/**
 * On a cloud blog the owner's credential lives at the console — this form can
 * only sign in team accounts. The screen has to route the owner out before
 * they mistake a console password's 401 for a forgotten one.
 */
describe('on a cloud blog', () => {
  const refuse = async (user: ReturnType<typeof userEvent.setup>) => {
    call.mockRejectedValue(refused);
    await user.type(screen.getByLabelText('Email'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'console-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByRole('alert');
  };

  it('offers the console door above the form', () => {
    useCloudStore.setState({ edition: 'cloud' });
    arrive();

    const door = screen.getByRole('link', { name: /sign in with plym cloud/i });
    expect(door).toHaveAttribute('href', 'https://cloud.plym.io');
    expect(screen.getByText(/or with a team account/i)).toBeInTheDocument();
  });

  it('points a refused sign-in at the console', async () => {
    useCloudStore.setState({ edition: 'cloud' });
    const user = userEvent.setup();
    arrive();
    await refuse(user);

    const hint = screen.getByRole('link', { name: 'sign in here' });
    expect(hint).toHaveAttribute('href', 'https://cloud.plym.io');
  });

  it('shows none of it to an OSS instance', async () => {
    useCloudStore.setState({ edition: 'oss' });
    const user = userEvent.setup();
    arrive();

    expect(
      screen.queryByRole('link', { name: /sign in with plym cloud/i }),
    ).not.toBeInTheDocument();

    await refuse(user);
    expect(
      screen.queryByRole('link', { name: 'sign in here' }),
    ).not.toBeInTheDocument();
  });
});
