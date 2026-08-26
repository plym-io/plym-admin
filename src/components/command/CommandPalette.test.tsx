import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CommandPalette } from './CommandPalette';
import { useUiStore } from '@/store/ui';

/**
 * The palette owns the focus of the whole app while it is open, so these are
 * really tests about what it hands back when it closes: a global shortcut that
 * declines to fire inside an input (which is every one of them but ⌘K) is dead
 * until focus leaves the search box.
 */

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // The palette queries posts while open; nothing here depends on the results.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
  useUiStore.setState({ commandOpen: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useUiStore.setState({ commandOpen: false });
});

describe('CommandPalette', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPalette();
    act(() => useUiStore.setState({ commandOpen: true }));

    await screen.findByPlaceholderText(/search posts/i);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(useUiStore.getState().commandOpen).toBe(false));
  });

  it('gives focus back to the document when it closes', async () => {
    const user = userEvent.setup();
    renderPalette();
    act(() => useUiStore.setState({ commandOpen: true }));

    const input = await screen.findByPlaceholderText(/search posts/i);
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.keyboard('{Escape}');

    // Left focused, the search box swallows every subsequent shortcut.
    await waitFor(() => expect(document.activeElement).not.toBe(input));
  });

  it('clears the query so reopening starts fresh', async () => {
    const user = userEvent.setup();
    renderPalette();
    act(() => useUiStore.setState({ commandOpen: true }));

    const input = await screen.findByPlaceholderText(/search posts/i);
    await user.type(input, 'hiring');
    expect(input).toHaveValue('hiring');

    await user.keyboard('{Escape}');
    act(() => useUiStore.setState({ commandOpen: true }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search posts/i)).toHaveValue(''),
    );
  });
});
