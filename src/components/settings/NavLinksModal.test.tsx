import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavLinksModal } from './NavLinksModal';

/**
 * The builder's job is to be the thing that cannot produce a config.yaml the
 * blog refuses to load. What is asserted here is the part the pure model can't
 * reach on its own: that a half-written row withholds the block rather than
 * handing it over, and that the dialog opens on what the server serves.
 *
 * The block is not on screen any more, so what the Copy button puts on the
 * clipboard is the only place the builder's output shows up — which makes the
 * clipboard the right thing to assert against.
 */

const copied = vi.hoisted(() => ({ text: null as string | null }));

vi.mock('@/lib/clipboard', () => ({
  copyText: async (text: string) => {
    copied.text = text;
    return true;
  },
}));

beforeEach(() => {
  copied.text = null;
});

/** Exactly the document `GET /api/config` serves, normalised list and all. */
const LINKS = {
  header: [
    { text: 'Home', url: '/', children: [] },
    {
      text: 'Resources',
      url: null,
      children: [
        { text: 'Docs', url: 'https://plym.io/docs/', children: [] },
        { text: 'Tools', url: '/tools', children: [] },
      ],
    },
  ],
  footer: [
    {
      text: 'Open Source',
      url: null,
      children: [
        { text: 'GitHub', url: 'https://github.com/plym-io/plym', children: [] },
        {
          text: 'License',
          url: 'https://github.com/plym-io/plym/blob/main/LICENSE',
          children: [],
        },
      ],
    },
    { text: 'About', url: '/about', children: [] },
  ],
};

function open(links: unknown = LINKS) {
  return render(<NavLinksModal open onClose={() => {}} links={links} />);
}

const copyButton = () => screen.getByRole('button', { name: /Copy config\.yaml|Copied/ });

/** What the Copy button would put on the clipboard, or null if it refuses. */
async function yaml(user: ReturnType<typeof userEvent.setup>): Promise<string | null> {
  const button = copyButton();
  if (button.hasAttribute('disabled')) return null;
  await user.click(button);
  return copied.text;
}

describe('NavLinksModal', () => {
  it('opens on the links the blog is serving', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Home');
    expect(screen.getByLabelText('Link 1 address')).toHaveValue('/');
    expect(screen.getByLabelText('Link 2 sub-link 1 label')).toHaveValue('Docs');
    expect(await yaml(user)).toContain('    Home: /');
  });

  it('shows no config.yaml block, only the button that copies one', () => {
    open();
    expect(document.querySelector('pre')).toBeNull();
    expect(copyButton()).toBeEnabled();
  });

  it('confirms on the button itself that the copy happened', async () => {
    const user = userEvent.setup();
    open();
    await user.click(copyButton());
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    // A further edit makes the copy stale, so the confirmation has to go.
    await user.type(screen.getByLabelText('Link 1 label'), '!');
    expect(screen.getByRole('button', { name: 'Copy config.yaml' })).toBeInTheDocument();
  });

  it('shows a menu row as a menu rather than as an empty address', () => {
    open();
    expect(screen.getByRole('button', { name: 'Menu', pressed: true })).toBeInTheDocument();
    expect(screen.queryByLabelText('Link 2 address')).not.toBeInTheDocument();
  });

  it('keeps each slot on its own tab', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.queryByDisplayValue('About')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Footer/ }));
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Open Source');
    expect(screen.getByLabelText('Link 2 label')).toHaveValue('About');
    expect(screen.getByText(/Powered by plym/)).toBeInTheDocument();
  });

  it('withholds the block while a row is unfinished', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /Add another link/ }));
    expect(await yaml(user)).toBeNull();
    expect(screen.getByText(/One link needs fixing/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Link 3 label'), 'Pricing');
    await user.type(screen.getByLabelText('Link 3 address'), '/pricing');
    expect(await yaml(user)).toContain('    Pricing: /pricing');
  });

  it('will not write a label YAML would read back as something else', async () => {
    const user = userEvent.setup();
    open();
    await user.clear(screen.getByLabelText('Link 1 label'));
    await user.type(screen.getByLabelText('Link 1 label'), '2026');
    expect(await yaml(user)).toContain('    "2026": /');
  });

  it('turns a link into a menu with the toggle, and back into the link it was', async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole('group', { name: 'Link 1 kind' });
    await user.click(within(toggle).getByRole('button', { name: 'Menu' }));
    expect(screen.queryByLabelText('Link 1 address')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Link 1 sub-link 1 label')).toBeInTheDocument();

    await user.click(within(toggle).getByRole('button', { name: 'Link' }));
    expect(screen.getByLabelText('Link 1 address')).toHaveValue('/');
  });

  it('names a row by its whole path, so two menus do not share one control', async () => {
    const user = userEvent.setup();
    open();
    await user.click(
      within(screen.getByRole('group', { name: 'Link 1 kind' })).getByRole('button', {
        name: 'Menu',
      }),
    );
    expect(screen.getByLabelText('Link 1 sub-link 1 label')).toHaveValue('');
    expect(screen.getByLabelText('Link 2 sub-link 1 label')).toHaveValue('Docs');
  });

  it('reorders from the drag handle with the arrow keys', async () => {
    const user = userEvent.setup();
    open();
    screen.getByRole('button', { name: 'Reorder link 2' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Resources');
    expect(screen.getByLabelText('Link 2 label')).toHaveValue('Home');
  });

  it('builds a titled column in the footer too', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('tab', { name: /Footer/ }));
    expect(screen.getByLabelText('Link 1 sub-link 2 label')).toHaveValue('License');
    const block = await yaml(user);
    expect(block).toContain('    Open Source:');
    expect(block).toContain('      GitHub: https://github.com/plym-io/plym');
    // The ungrouped one keeps its own row beneath the columns.
    expect(block).toContain('    About: /about');
  });

  it('says so when two links in one block would collapse into one', async () => {
    const user = userEvent.setup();
    open();
    await user.clear(screen.getByLabelText('Link 1 label'));
    await user.type(screen.getByLabelText('Link 1 label'), 'Resources');
    expect(screen.getAllByText(/Another link here has this label/)).toHaveLength(2);
    expect(await yaml(user)).toBeNull();
  });

  it('offers a blog with no links an empty list rather than a blank form', async () => {
    const user = userEvent.setup();
    open(null);
    expect(screen.getByText(/Nothing in the header yet/)).toBeInTheDocument();
    expect(await yaml(user)).toBe('links:\n  header: {}\n  footer: {}');
  });
});
