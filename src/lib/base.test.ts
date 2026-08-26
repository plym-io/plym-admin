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

describe('panelMove', () => {
  it('carries the current route to the new prefix', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/settings');
    expect(panelMove('/news')?.adminUrl).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
  });

  it('accepts a prefix written without slashes, or with too many', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/settings');
    expect(panelMove('news')?.adminUrl).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
    expect(panelMove('/news/')?.adminUrl).toBe(
      'http://localhost:3000/news/plym-admin/settings',
    );
  });

  it('moves the panel to the domain root when the blog goes there', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/settings');
    expect(panelMove('')?.adminUrl).toBe('http://localhost:3000/plym-admin/settings');
    expect(panelMove('/')?.adminUrl).toBe('http://localhost:3000/plym-admin/settings');
  });

  it('keeps the query and hash, and lands on the root of the panel from its root', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/?tab=x#top');
    expect(panelMove('/news')?.adminUrl).toBe(
      'http://localhost:3000/news/plym-admin/?tab=x#top',
    );
  });

  /* The gateway moves with the panel, and stays on this origin — which is the
     whole reason an operation that moves it can still be followed. */
  it('names the gateway’s new base under the same prefix', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/domain');
    expect(panelMove('/news')?.cloudBase).toBe('/news/cloud');
    expect(panelMove('')?.cloudBase).toBe('/cloud');
  });

  /* Nothing is taken away, so there is nothing to warn about and nothing to
     follow — however the prefix that resolves here happens to be written. */
  it('is not a move when the prefix resolves to where the panel already is', async () => {
    const { panelMove } = await mountedAt('/blog/plym-admin/settings');
    expect(panelMove('/blog')).toBeNull();
    expect(panelMove('blog')).toBeNull();
    expect(panelMove('/blog/')).toBeNull();
  });

  it('is not a move at the root either', async () => {
    const { panelMove } = await mountedAt('/plym-admin/settings');
    expect(panelMove('')).toBeNull();
    expect(panelMove('/')).toBeNull();
    expect(panelMove('/blog')).not.toBeNull();
  });
});
