import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishDateField } from './PublishDateField';

const setButton = () => screen.getByRole('button', { name: /set publish date/i });
const input = () => screen.getByLabelText(/publish date/i);

describe('PublishDateField', () => {
  it('offers the date on a draft, not only once published', () => {
    render(<PublishDateField value={null} status="draft" onCommit={vi.fn()} />);
    expect(setButton()).toBeInTheDocument();
  });

  it('is collapsed while unset and expands on demand', async () => {
    render(<PublishDateField value={null} status="draft" onCommit={vi.fn()} />);
    expect(screen.queryByLabelText(/publish date/i)).not.toBeInTheDocument();
    await userEvent.click(setButton());
    expect(input()).toBeInTheDocument();
  });

  it('starts expanded on a post that already carries a date', () => {
    render(
      <PublishDateField
        value="2020-01-15T09:30:00Z"
        status="published"
        onCommit={vi.fn()}
      />,
    );
    expect(input()).toHaveValue('2020-01-15T09:30');
  });

  it('commits the typed wall clock as a UTC instant', async () => {
    const onCommit = vi.fn();
    render(<PublishDateField value={null} status="draft" onCommit={onCommit} />);
    await userEvent.click(setButton());
    await userEvent.type(input(), '2019-03-04T12:00');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith('2019-03-04T12:00:00Z');
  });

  it('echoes the date the post will actually show', async () => {
    // A live post is already expanded — it has no "＋ Set publish date" step.
    render(<PublishDateField value={null} status="published" onCommit={vi.fn()} />);
    await userEvent.type(input(), '2019-03-04T12:00');
    expect(screen.getByText(/shows as march 04, 2019/i)).toBeInTheDocument();
  });

  it('says a draft date is held until publishing', async () => {
    render(<PublishDateField value={null} status="draft" onCommit={vi.fn()} />);
    await userEvent.click(setButton());
    await userEvent.type(input(), '2019-03-04T12:00');
    expect(screen.getByText(/once published/i)).toBeInTheDocument();
  });

  it('explains the default while no date is set', async () => {
    render(<PublishDateField value={null} status="draft" onCommit={vi.fn()} />);
    await userEvent.click(setButton());
    expect(screen.getByText(/defaults to the moment/i)).toBeInTheDocument();
  });

  it('clears to null from the explicit control', async () => {
    const onCommit = vi.fn();
    render(
      <PublishDateField
        value="2020-01-15T09:30:00Z"
        status="published"
        onCommit={onCommit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear date/i }));
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('keeps a dateless published post on screen instead of collapsing it away', async () => {
    // Clearing is allowed in every status, so a live post can end up with no
    // date. That is a state the page is visibly the worse for — it must not
    // look like an ordinary unset draft.
    const { rerender } = render(
      <PublishDateField
        value="2020-01-15T09:30:00Z"
        status="published"
        onCommit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear date/i }));
    rerender(<PublishDateField value={null} status="published" onCommit={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: /set publish date/i }),
    ).not.toBeInTheDocument();
    expect(input()).toBeInTheDocument();
  });

  it('warns that a live post is carrying no date', () => {
    render(<PublishDateField value={null} status="published" onCommit={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/live with no date/i);
  });

  it('holds the warning back while the status change is still in flight', () => {
    render(
      <PublishDateField value={null} status="published" statusPending onCommit={vi.fn()} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(input()).toBeInTheDocument();
  });

  it('still collapses a dateless draft, which is the ordinary case', () => {
    render(<PublishDateField value={null} status="draft" onCommit={vi.fn()} />);
    expect(setButton()).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not rewrite a microsecond-precision date left untouched', async () => {
    const onCommit = vi.fn();
    render(
      <PublishDateField
        value="2026-08-04T23:45:31.652060Z"
        status="published"
        onCommit={onCommit}
      />,
    );
    expect(input()).toHaveValue('2026-08-04T23:45');
    await userEvent.click(input());
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits nothing when a blur follows no edit', async () => {
    const onCommit = vi.fn();
    render(
      <PublishDateField
        value="2020-01-15T09:30:00Z"
        status="published"
        onCommit={onCommit}
      />,
    );
    await userEvent.click(input());
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('follows the post when it is reloaded upstream', () => {
    const { rerender } = render(
      <PublishDateField
        value="2020-01-15T09:30:00Z"
        status="published"
        onCommit={vi.fn()}
      />,
    );
    rerender(
      <PublishDateField
        value="2019-03-04T12:00:00Z"
        status="published"
        onCommit={vi.fn()}
      />,
    );
    expect(input()).toHaveValue('2019-03-04T12:00');
  });
});
