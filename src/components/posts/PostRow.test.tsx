import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PostRow } from './PostRow';
import type { PostListItem } from '@/types';

const base: PostListItem = {
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  id: 1,
  slug: 'hello-world',
  title: 'Hello world',
  status: 'published',
  reading_time: 3,
  excerpt: 'An excerpt',
  cover: null,
  canonical_url: null,
  published_at: '2026-01-02T00:00:00Z',
  author: { id: 1, display_name: 'Sam Rivera' },
  tags: [],
};

function renderRow(post: PostListItem) {
  return render(
    <MemoryRouter>
      <PostRow
        post={post}
        onTogglePublish={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('PostRow canonical indicator', () => {
  it('shows the LinkSimple indicator when canonical_url is set', () => {
    renderRow({ ...base, canonical_url: 'https://medium.com/@me/post' });
    expect(screen.getByTitle(/canonical url: medium\.com/i)).toBeInTheDocument();
  });

  it('shows no indicator when canonical_url is null', () => {
    renderRow(base);
    expect(screen.queryByTitle(/canonical url/i)).not.toBeInTheDocument();
  });
});
