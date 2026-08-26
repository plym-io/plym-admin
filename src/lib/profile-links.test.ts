import { describe, it, expect } from 'vitest';
import {
  validateLinkUrl,
  normalizeLinks,
  platformLabel,
  TOP_PLATFORMS,
  LINK_PLATFORMS,
} from './profile-links';

describe('validateLinkUrl', () => {
  it('accepts a full https URL', () => {
    expect(validateLinkUrl('https://github.com/me')).toBeNull();
  });

  it('accepts http as well as https', () => {
    expect(validateLinkUrl('http://example.com')).toBeNull();
  });

  it('rejects a bare domain (no scheme)', () => {
    expect(validateLinkUrl('example.com')).toBeTruthy();
  });

  it('rejects a non-http scheme', () => {
    expect(validateLinkUrl('ftp://example.com')).toBeTruthy();
  });
});

describe('normalizeLinks', () => {
  it('drops rows with a blank URL', () => {
    const r = normalizeLinks([
      { type: 'github', url: '' },
      { type: '', url: '  ' },
    ]);
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('trims and keeps valid rows', () => {
    const r = normalizeLinks([{ type: 'github', url: '  https://github.com/me  ' }]);
    expect(r).toEqual({ ok: true, value: [{ type: 'github', url: 'https://github.com/me' }] });
  });

  it('flags a URL without a platform', () => {
    const r = normalizeLinks([{ type: '', url: 'https://x.com/me' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toBeTruthy();
  });

  it('flags an invalid URL by index', () => {
    const r = normalizeLinks([
      { type: 'github', url: 'https://github.com/me' },
      { type: 'x', url: 'not-a-url' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toBeUndefined();
      expect(r.errors[1]).toBeTruthy();
    }
  });
});

describe('platforms', () => {
  it('shows exactly the top 6 up front', () => {
    expect(TOP_PLATFORMS).toHaveLength(6);
    expect(TOP_PLATFORMS.map((p) => p.value)).toEqual([
      'linkedin',
      'website',
      'github',
      'x',
      'youtube',
      'instagram',
    ]);
  });

  it('resolves slugs to labels and falls back to the raw value', () => {
    expect(platformLabel('github')).toBe('GitHub');
    expect(platformLabel('unknown')).toBe('unknown');
  });

  it('has unique slugs', () => {
    const slugs = LINK_PLATFORMS.map((p) => p.value);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
