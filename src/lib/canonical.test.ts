import { describe, it, expect } from 'vitest';
import { validateCanonical } from './canonical';

describe('validateCanonical', () => {
  it('accepts a full https URL (round-trip value)', () => {
    expect(validateCanonical('https://medium.com/@me/post')).toEqual({
      value: 'https://medium.com/@me/post',
      error: null,
    });
  });

  it('accepts http as well as https', () => {
    expect(validateCanonical('http://example.com').error).toBeNull();
  });

  it('maps empty / whitespace to null (clear)', () => {
    expect(validateCanonical('')).toEqual({ value: null, error: null });
    expect(validateCanonical('   ')).toEqual({ value: null, error: null });
  });

  it('rejects a non-URL', () => {
    const r = validateCanonical('not-a-url');
    expect(r.value).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('rejects a non-http(s) URL', () => {
    expect(validateCanonical('ftp://example.com').error).toBeTruthy();
  });

  it('rejects a URL longer than 2048 chars', () => {
    const long = 'https://example.com/' + 'a'.repeat(2050);
    expect(validateCanonical(long).error).toBeTruthy();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateCanonical('  https://x.com  ').value).toBe('https://x.com');
  });
});
