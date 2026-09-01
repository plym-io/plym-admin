import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavLinksModal } from './NavLinksModal';

/**
 * The builder's job is to be the thing that cannot produce a config.yaml the
 * blog refuses to load. What is asserted here is the part the pure model can't
 * reach on its own: that a half-written row withholds the block rather than
 * offering it, and that the dialog opens on what the server serves.
 */

const LINKS = {
  header: [
    { text: 'Home', url: '/', children: [] },
    {
      text: 'Resources',
      url: null,
      children: [{ text: 'Docs', url: 'https://plym.io/docs/', children: [] }],
    },
  ],
  footer: [{ text: 'About', url: '/about', children: [] }],
};

function open(links: unknown = LINKS) {
  return render(<NavLinksModal open onClose={() => {}} links={links} />);
}

const yaml = () => document.querySelector('pre')?.textContent ?? null;

describe('NavLinksModal', () => {
  it('opens on the links the blog is serving', () => {
    open();
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Home');
    expect(screen.getByLabelText('Link 1 address')).toHaveValue('/');
    expect(screen.getByLabelText('Link 2 sub-link 1 label')).toHaveValue('Docs');
    expect(yaml()).toContain('    - text: Home');
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
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('About');
    expect(screen.getByText(/Powered by plym/)).toBeInTheDocument();
  });

  it('withholds the block while a row is unfinished', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /Add another link/ }));
    expect(yaml()).toBeNull();
    expect(screen.getByText(/One link is unfinished/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Link 3 label'), 'Pricing');
    await user.type(screen.getByLabelText('Link 3 address'), '/pricing');
    expect(yaml()).toContain('    - text: Pricing');
  });

  it('will not write a label YAML would read back as something else', async () => {
    const user = userEvent.setup();
    open();
    await user.clear(screen.getByLabelText('Link 1 label'));
    await user.type(screen.getByLabelText('Link 1 label'), '2026');
    expect(yaml()).toContain('- text: "2026"');
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

  it('offers no menus in the footer, which is a flat list', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('tab', { name: /Footer/ }));
    expect(screen.getByLabelText('Link 1 address')).toHaveValue('/about');
    expect(screen.queryByRole('group', { name: 'Link 1 kind' })).not.toBeInTheDocument();
  });

  it('offers a blog with no links an empty list rather than a blank form', () => {
    open(null);
    expect(screen.getByText(/Nothing in the header yet/)).toBeInTheDocument();
    expect(yaml()).toBe('links:\n  header: []\n  footer: []');
  });
});
