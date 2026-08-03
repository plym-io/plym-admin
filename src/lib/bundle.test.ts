import { describe, expect, it } from 'vitest';
import { BUNDLE_VERSION, bundleFilename, parseBundle, summarize } from './bundle';

const minimal = {
  plym_bundle: BUNDLE_VERSION,
  exported_at: '2026-08-03T10:00:00Z',
  posts: [{ title: 'Hello', slug: 'hello', content: '# Hi', status: 'published' }],
};

describe('parseBundle', () => {
  it('reads a bundle and fills in the optional collections', () => {
    const b = parseBundle(JSON.stringify(minimal));
    expect(summarize(b)).toEqual({ posts: 1, categories: 0, faqs: 0, media: 0 });
    expect(b.posts[0]).toMatchObject({ slug: 'hello', tags: [], faqs: [] });
  });

  it('rejects something that is not JSON', () => {
    expect(() => parseBundle('not json')).toThrow(/isn't JSON/);
  });

  it('rejects JSON that is not a plym export', () => {
    expect(() => parseBundle('{"hello":true}')).toThrow(/plym export/);
  });

  it('rejects a bundle from a newer plym than this panel', () => {
    expect(() => parseBundle(JSON.stringify({ ...minimal, plym_bundle: 99 }))).toThrow(
      /newer version/,
    );
  });

  it('drops entries that could never be posted, and says so if none are left', () => {
    expect(() =>
      parseBundle(JSON.stringify({ posts: [{ title: 'No slug' }, { slug: 'no-title' }] })),
    ).toThrow(/No usable posts/);
  });

  it('defaults a post with no status to a draft rather than publishing it', () => {
    const b = parseBundle(JSON.stringify({ posts: [{ title: 'A', slug: 'a' }] }));
    expect(b.posts[0].status).toBe('draft');
    expect(b.posts[0].content).toBe('');
  });
});

describe('bundleFilename', () => {
  it('slugifies the site name and dates the file', () => {
    expect(bundleFilename('Acme Blog!')).toMatch(/^acme-blog-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('falls back to a usable name when the site has none', () => {
    expect(bundleFilename(undefined)).toMatch(/^plym-export-/);
    expect(bundleFilename('!!!')).toMatch(/^plym-export-/);
  });
});
