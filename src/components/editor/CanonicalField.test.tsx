import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanonicalField } from './CanonicalField';

const addButton = () => screen.getByRole('button', { name: /add canonical url/i });

describe('CanonicalField', () => {
  it('is collapsed (optional) by default, expanding on demand', async () => {
    render(<CanonicalField value={null} onCommit={vi.fn()} />);
    expect(addButton()).toBeInTheDocument();
    expect(screen.queryByLabelText(/canonical url/i)).not.toBeInTheDocument();
    await userEvent.click(addButton());
    expect(screen.getByLabelText(/canonical url/i)).toBeInTheDocument();
  });

  it('round-trips a valid URL on blur', async () => {
    const onCommit = vi.fn();
    render(<CanonicalField value={null} onCommit={onCommit} />);
    await userEvent.click(addButton());
    await userEvent.type(screen.getByLabelText(/canonical url/i), 'https://medium.com/post');
    await userEvent.tab(); // blur
    expect(onCommit).toHaveBeenCalledWith('https://medium.com/post');
  });

  it('starts expanded and commits null when cleared', async () => {
    const onCommit = vi.fn();
    render(<CanonicalField value="https://medium.com/post" onCommit={onCommit} />);
    const input = screen.getByLabelText(/canonical url/i);
    await userEvent.clear(input);
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('shows an inline error and does not commit an invalid URL', async () => {
    const onCommit = vi.fn();
    render(<CanonicalField value={null} onCommit={onCommit} />);
    await userEvent.click(addButton());
    const input = screen.getByLabelText(/canonical url/i);
    await userEvent.type(input, 'not-a-url');
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/valid url|http/i)).toBeInTheDocument();
  });

  it('shows the empty-state hint once expanded, not when a value is set', async () => {
    const { rerender } = render(<CanonicalField value={null} onCommit={vi.fn()} />);
    await userEvent.click(addButton());
    expect(screen.getByText(/where this post originally lived/i)).toBeInTheDocument();
    rerender(<CanonicalField value="https://x.com" onCommit={vi.fn()} />);
    expect(
      screen.queryByText(/where this post originally lived/i),
    ).not.toBeInTheDocument();
  });
});
