import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * `adminBase` and `apiBase` are read from the URL once, at import — so every
 * case here has to mount the app somewhere and then load the module fresh.
 */
async function mountedAt(path: string) {
  window.history.replaceState({}, '', path);
  vi.resetModules();
  return import('./base');
}

beforeEach(() => {
  vi.resetModules();
});

describe('adminBase and apiBase', () => {
  it('reads the blog prefix off the panel’s own URL', async () => {
    const { adminBase, apiBase } = await mountedAt('/blog/plym-admin/posts');
    expect(adminBase).toBe('/blog/plym-admin');
    expect(apiBase).toBe('/blog');
  });

  it('leaves the API at the root for a blog mounted there', async () => {
    const { adminBase, apiBase } = await mountedAt('/plym-admin/');
    expect(adminBase).toBe('/plym-admin');
    expect(apiBase).toBe('');
  });
});

describe('adminUrlForPrefix', () => {
  it('carries the current route to the new prefix', async () => {
    const { adminUrlForPrefix } = await mountedAt('/blog/plym-admin/settings');
    expect(adminUrlForPrefix('/news')).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
  });

  it('accepts a prefix written without slashes, or with too many', async () => {
    const { adminUrlForPrefix } = await mountedAt('/blog/plym-admin/settings');
    expect(adminUrlForPrefix('news')).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
    expect(adminUrlForPrefix('/news/')).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
  });

  it('moves the panel to the domain root when the blog goes there', async () => {
    const { adminUrlForPrefix } = await mountedAt('/blog/plym-admin/settings');
    expect(adminUrlForPrefix('')).toBe('http://localhost:3000/plym-admin/settings');
    expect(adminUrlForPrefix('/')).toBe('http://localhost:3000/plym-admin/settings');
  });

  it('keeps the query and hash, and lands on the root of the panel from its root', async () => {
    const { adminUrlForPrefix } = await mountedAt('/blog/plym-admin/?tab=x#top');
    expect(adminUrlForPrefix('/news')).toBe(
      'http://localhost:3000/news/plym-admin/?tab=x#top',
    );
  });
});
