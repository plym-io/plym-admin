import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Mcp from './mcp';
import { useAuthStore } from '@/store/auth';
import { useCloudStore } from '@/store/cloud';
import type { Role, User } from '@/types';

/**
 * Who may switch the server on, and what everyone else is told. The gateway
 * answers 403 to a non-administrator asking for settings, so the panel cannot
 * know whether MCP is running — the one thing this screen must never guess.
 */

const getSettings = vi.fn();

vi.mock('@/api/cloud', () => ({
  getSettings: () => getSettings(),
  getStatus: () => Promise.resolve({ url: 'https://acme.plym.space' }),
  applySettings: vi.fn(),
  getOpEvents: vi.fn(() => new Promise(() => {})),
}));

const signIn = (role: Role) =>
  useAuthStore.setState({
    user: { id: 1, email: 'someone@acme.com', role, display_name: 'Someone' } as User,
  });

const edition = (e: 'cloud' | 'oss') => useCloudStore.setState({ edition: e });

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ values: { 'mcp.enabled': true }, schema: [] });
});

describe('an editor', () => {
  it('is offered no switch and no reading of one', async () => {
    signIn('editor');
    edition('cloud');
    render(<Mcp />);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/Running\./)).toBeNull();
    expect(screen.queryByText(/^Off\./)).toBeNull();
    expect(getSettings).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Changing MCP settings needs the administrator role/),
    ).toBeInTheDocument();
  });

  it('still gets everything needed to connect a client', () => {
    signIn('editor');
    edition('cloud');
    render(<Mcp />);

    expect(screen.getByText('Connect a client')).toBeInTheDocument();
    expect(screen.getByText('Endpoint and credentials')).toBeInTheDocument();
  });

  it('is not told to run the CLI on a self-hosted blog either', () => {
    signIn('editor');
    edition('oss');
    render(<Mcp />);

    expect(screen.queryAllByText(/plym enable mcp/)).toHaveLength(0);
    expect(screen.getByText('Connect a client')).toBeInTheDocument();
  });
});

describe('an administrator', () => {
  it('keeps the switch on cloud', async () => {
    signIn('administrator');
    edition('cloud');
    render(<Mcp />);

    await waitFor(() => expect(screen.getByRole('switch')).toBeInTheDocument());
    expect(getSettings).toHaveBeenCalled();
  });

  it('keeps the CLI instructions on a self-hosted blog', () => {
    signIn('administrator');
    edition('oss');
    render(<Mcp />);

    expect(screen.queryAllByText(/plym enable mcp/).length).toBeGreaterThan(0);
  });
});
