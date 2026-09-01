import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavLinksModal } from './NavLinksModal';

/**
 * What is asserted here is the part the pure model can't reach on its own: that
 * the dialog opens on what the server serves, that each control edits the row
 * it names, and that a row which could not be configured says so on the row.
 */

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

const hints = (pattern: RegExp) => screen.queryAllByText(pattern);

describe('NavLinksModal', () => {
  it('opens on the links the blog is serving', () => {
    open();
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Home');
    expect(screen.getByLabelText('Link 1 address')).toHaveValue('/');
    expect(screen.getByLabelText('Link 2 sub-link 1 label')).toHaveValue('Docs');
  });

  it('says nothing about config.yaml, which this screen does not write', () => {
    open();
    expect(document.querySelector('pre')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('plym rebuild');
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

  it('says on the row itself what a new one still needs', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: /Add another link/ }));
    expect(hints(/Give this one a label/)).toHaveLength(1);

    await user.type(screen.getByLabelText('Link 3 label'), 'Pricing');
    expect(hints(/Give this one a label/)).toHaveLength(0);
    expect(hints(/Add where it goes/)).toHaveLength(1);

    await user.type(screen.getByLabelText('Link 3 address'), '/pricing');
    expect(hints(/Add where it goes/)).toHaveLength(0);
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
    // A titled column, and beside it the ungrouped link that keeps its own row.
    expect(screen.getByLabelText('Link 1 label')).toHaveValue('Open Source');
    expect(screen.getByLabelText('Link 1 sub-link 2 label')).toHaveValue('License');
    expect(screen.getByLabelText('Link 2 address')).toHaveValue('/about');
  });

  it('says so when two links in one block would collapse into one', async () => {
    const user = userEvent.setup();
    open();
    await user.clear(screen.getByLabelText('Link 1 label'));
    await user.type(screen.getByLabelText('Link 1 label'), 'Resources');
    expect(hints(/Another link here has this label/)).toHaveLength(2);
  });

  it('offers a blog with no links an empty list rather than a blank form', () => {
    open(null);
    expect(screen.getByText(/Nothing in the header yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Link 1 label')).not.toBeInTheDocument();
  });
});
