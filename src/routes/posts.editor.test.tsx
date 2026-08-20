import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import PostEditor from './posts.editor';

/**
 * `published_at` is the only post field the server writes on its own: the
 * publish trigger stamps it the first time a post goes live. The editor's draft
 * does not know that has happened, so the danger is the *next* autosave — it
 * carries the draft's own idea of the date and can hand back the null the post
 * had before it was published, silently clearing it.
 */

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('@/api/client', () => ({
  api: {
    GET: (...args: unknown[]) => getMock(...args),
    POST: (...args: unknown[]) => postMock(...args),
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
  call: (result: Promise<unknown>) => result,
}));

// Children that fetch or wrap CodeMirror; none of them touch persistence.
vi.mock('@/components/editor/MarkdownEditor', () => ({
  MarkdownEditor: () => <div data-testid="markdown-editor" />,
}));
vi.mock('@/components/editor/CoverWidget', () => ({ CoverWidget: () => null }));
vi.mock('@/components/editor/TagsInput', () => ({ TagsInput: () => null }));
vi.mock('@/components/editor/FaqSection', () => ({ FaqSection: () => null }));
vi.mock('@/components/editor/CategoryField', () => ({ CategoryField: () => null }));

const STAMPED = '2026-08-10T22:06:03.581835Z';

const DRAFT_POST = {
  id: 1,
  slug: 'a-post',
  path: 'a-post',
  title: 'A post',
  status: 'draft',
  reading_time: 1,
  excerpt: null,
  cover: null,
  canonical_url: null,
  weight: null,
  published_at: null,
  content: 'body',
  author: { id: 1, display_name: 'Admin', avatar_url: null, links: [] },
  category: null,
  tags: [],
  faqs: [],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/posts/1']}>
      <Routes>
        <Route path="/posts/:id" element={<PostEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Bodies of every PATCH the editor has sent to the post itself. */
const patchBodies = () =>
  patchMock.mock.calls
    .filter((c) => c[0] === '/api/posts/{post_id}')
    .map((c) => (c[1] as { body: Record<string, unknown> }).body);

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockImplementation((path: string) =>
    path === '/api/posts/{post_id}'
      ? Promise.resolve(DRAFT_POST)
      : Promise.resolve([]),
  );
  postMock.mockResolvedValue({ ...DRAFT_POST, status: 'published' });
  patchMock.mockResolvedValue({ ...DRAFT_POST, status: 'published', published_at: STAMPED });
});

describe('post editor — published_at', () => {
  it('does not clear the stamped date on the autosave after publishing', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /published/i }));
    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    // Publishing also fills a blank excerpt (see the block below); this test is
    // only about what happens to the date, so it asserts nothing wider.
    expect(patchBodies()[0]).toMatchObject({ status: 'published' });
    expect(patchBodies()[0]).not.toHaveProperty('published_at');

    // Keep writing. This is the save that used to undo the publish date.
    await user.type(screen.getByPlaceholderText('Title'), '!');
    await waitFor(() => expect(patchBodies().length).toBeGreaterThan(1), { timeout: 4000 });

    // Leaving the field out is fine; sending it is fine only if it still names
    // the stamped date. Sending null is the regression.
    const autosave = patchBodies()[patchBodies().length - 1];
    expect('published_at' in autosave ? autosave.published_at : STAMPED).toBe(STAMPED);
  });

  it('omits published_at from a save that did not touch the date', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.type(screen.getByPlaceholderText('Title'), '!');
    await waitFor(() => expect(patchBodies()).toHaveLength(1), { timeout: 4000 });
    expect(patchBodies()[0]).not.toHaveProperty('published_at');
  });

  it('sends the date the author picked', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('button', { name: /set publish date/i }));
    await user.type(screen.getByLabelText(/publish date/i), '2019-03-04T12:00');
    await user.tab();

    await waitFor(() => expect(patchBodies()).toHaveLength(1), { timeout: 4000 });
    expect(patchBodies()[0].published_at).toBe('2019-03-04T12:00:00Z');
  });
});

/**
 * The excerpt is the post's meta description, og:description and JSON-LD
 * description all at once, so publishing with the field blank ships a post
 * with none of them. Publishing fills it from the opening prose — visibly, so
 * the author can still edit what went out.
 */
describe('post editor — excerpt on publish', () => {
  const excerptField = () => screen.getByPlaceholderText('Add a one-line excerpt…');

  const loadPost = (post: Record<string, unknown>) =>
    getMock.mockImplementation((path: string) =>
      path === '/api/posts/{post_id}'
        ? Promise.resolve({ ...DRAFT_POST, ...post })
        : Promise.resolve([]),
    );

  it('derives one from the content when the field is empty', async () => {
    const user = userEvent.setup();
    loadPost({
      excerpt: null,
      content: '# A title\n\nThe first thing the post actually says.\n\nMore later.',
    });
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /published/i }));

    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    expect(patchBodies()[0]).toEqual({
      status: 'published',
      excerpt: 'The first thing the post actually says.',
    });
  });

  it('shows what it derived, so the author can change it', async () => {
    const user = userEvent.setup();
    loadPost({ excerpt: null, content: 'What this post is about.' });
    renderEditor();
    await screen.findByTestId('markdown-editor');

    expect(excerptField()).toHaveValue('');
    await user.click(screen.getByRole('radio', { name: /published/i }));

    await waitFor(() => expect(excerptField()).toHaveValue('What this post is about.'));
  });

  it('never overwrites an excerpt the author wrote', async () => {
    const user = userEvent.setup();
    loadPost({ excerpt: 'Mine, thanks.', content: 'Something else entirely.' });
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /published/i }));

    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    expect(patchBodies()[0]).toEqual({ status: 'published' });
    expect(excerptField()).toHaveValue('Mine, thanks.');
  });

  it('only derives on the way to published', async () => {
    const user = userEvent.setup();
    loadPost({ excerpt: null, content: 'Some prose.', status: 'draft' });
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /archived/i }));

    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    expect(patchBodies()[0]).toEqual({ status: 'archived' });
  });

  it('sends nothing extra when there is no prose to derive from', async () => {
    const user = userEvent.setup();
    loadPost({ excerpt: null, content: '```\njust code\n```' });
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /published/i }));

    await waitFor(() => expect(patchBodies()).toHaveLength(1));
    expect(patchBodies()[0]).toEqual({ status: 'published' });
  });

  it('puts the field back when publishing fails', async () => {
    const user = userEvent.setup();
    loadPost({ excerpt: null, content: 'Some prose.' });
    patchMock.mockRejectedValue(new Error('nope'));
    renderEditor();
    await screen.findByTestId('markdown-editor');

    await user.click(screen.getByRole('radio', { name: /published/i }));

    await waitFor(() => expect(screen.getByRole('radio', { name: /draft/i })).toBeChecked());
    expect(excerptField()).toHaveValue('');
  });
});
