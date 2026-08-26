import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { RouteError } from './RouteError';
import { useCloudStore } from '@/store/cloud';

/**
 * What an interrupted panel says, and what it does about it. The failure this
 * screen exists for is an update replacing the chunk an open tab was about to
 * load: it has to be told apart from a dead link and from a real fault, and it
 * has to end on its own when the update lands.
 */

const reload = vi.fn();
const fetchMock = vi.fn();

const STALE = new TypeError(
  'Failed to fetch dynamically imported module: /blog/plym-admin/assets/login-CjQboCG_.js',
);

function arrive(thrown: unknown, path = '/') {
  function Boom(): React.ReactNode {
    throw thrown;
  }
  const router = createMemoryRouter(
    [
      {
        element: <Outlet />,
        errorElement: <RouteError />,
        children: [{ path: '/', element: <Boom /> }],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  reload.mockReset();
  fetchMock.mockReset();
  sessionStorage.clear();
  useCloudStore.setState({ edition: 'oss', capabilities: null });
  vi.stubGlobal('location', { ...window.location, reload });
  vi.stubGlobal('fetch', fetchMock);
  // React reports every error it hands to a boundary, and these are on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a chunk that the running build no longer has', () => {
  it('says the panel is being updated rather than naming the module', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    arrive(STALE);

    expect(
      screen.getByText('The admin portal is being updated'),
    ).toBeInTheDocument();
    expect(screen.getByText(/couple of minutes/)).toBeInTheDocument();
    expect(screen.queryByText(/login-CjQboCG_/)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('returns to the panel by itself once it answers again', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    arrive(STALE);

    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('keeps waiting while the panel is still down', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    arrive(STALE);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for it to come back');
  });

  /* A reload that lands on the same failure is a reload that is not the cure,
     so the second one is the reader's to make. */
  it('does not reload twice over the same failure', async () => {
    sessionStorage.setItem('plym.admin.reloaded', String(Date.now()));
    fetchMock.mockResolvedValue({ ok: true });
    arrive(STALE);

    await waitFor(() =>
      expect(screen.getByText(/answering again/)).toBeInTheDocument(),
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers support only to the edition that has any', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const oss = arrive(STALE);
    expect(screen.queryByRole('link', { name: 'contact support' })).toBeNull();
    oss.unmount();

    useCloudStore.setState({ edition: 'cloud' });
    arrive(STALE);
    expect(screen.getByRole('link', { name: 'contact support' })).toHaveAttribute(
      'href',
      'https://cloud.plym.io/support',
    );
  });
});

describe('the other two failures', () => {
  /* Waiting does not make a route exist, and support cannot conjure one
     either: the only thing to offer is the way back. */
  it('calls an address that matches no route a dead link, and waits for nothing', () => {
    useCloudStore.setState({ edition: 'cloud' });
    arrive(null, '/typo');

    expect(screen.getByText('That page isn’t here')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'contact support' })).toBeNull();
  });

  it('names a real fault and keeps the line support would ask for', () => {
    useCloudStore.setState({ edition: 'cloud' });
    arrive(new TypeError('posts.map is not a function'));

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('posts.map is not a function')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact support' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
