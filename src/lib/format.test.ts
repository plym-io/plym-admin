import { describe, it, expect } from 'vitest';
import { hostname } from './format';

describe('hostname', () => {
  it('extracts the bare host', () => {
    expect(hostname('https://medium.com/@me/post')).toBe('medium.com');
  });

  it('strips a leading www.', () => {
    expect(hostname('https://www.example.com/x')).toBe('example.com');
  });

  it('returns the input unchanged when it is not a URL', () => {
    expect(hostname('not-a-url')).toBe('not-a-url');
  });
});
