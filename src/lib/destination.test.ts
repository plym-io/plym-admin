import { describe, expect, it } from 'vitest';
import { describeDestination, parseDestination } from './destination';

/** The value, or a failure the test can read in its message. */
function parse(input: string, platform?: string) {
  const r = parseDestination(input, platform);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got: ${r.message}`);
  return r.value;
}

describe('parseDestination', () => {
  it('accepts what people actually type', () => {
    expect(parse('blog.acme.com').url).toBe('https://blog.acme.com');
    expect(parse('  ACME.com/blog/  ').url).toBe('https://acme.com/blog');
    expect(parse('https://www.acme.com/blog').url).toBe('https://www.acme.com/blog');
    expect(parse('http://acme.com').url).toBe('https://acme.com');
  });

  it('tells a subdomain from a folder from a whole site', () => {
    expect(parse('blog.acme.com').shape).toBe('subdomain');
    expect(parse('acme.com/blog').shape).toBe('path');
    expect(parse('blog.acme.com/news').shape).toBe('path');
    expect(parse('acme.com').shape).toBe('root');
    // www is the site itself, not a subdomain someone means to single out.
    expect(parse('www.acme.com').shape).toBe('root');
  });

  it('does not read a two-part suffix as a subdomain', () => {
    expect(parse('acme.co.uk').shape).toBe('root');
    expect(parse('blog.acme.co.uk').shape).toBe('subdomain');
  });

  it('keeps the prefix without its trailing slash, and empty at the root', () => {
    expect(parse('acme.com/blog/').prefix).toBe('/blog');
    expect(parse('acme.com/').prefix).toBe('');
    expect(parse('acme.com/news/blog').prefix).toBe('/news/blog');
  });

  it('turns down the plym address it already has, by name', () => {
    const r = parseDestination('acme.plym.space', 'plym.space');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('domain you own');
  });

  it('allows a domain that merely looks like the platform one', () => {
    expect(parse('plym.space.acme.com', 'plym.space').host).toBe('plym.space.acme.com');
  });

  it('refuses what the gateway could not act on, and says why', () => {
    for (const input of ['', 'acme', 'acme com/blog', 'ftp://acme.com', '127.0.0.1', 'localhost']) {
      const r = parseDestination(input);
      expect(r.ok, `"${input}" should not parse`).toBe(false);
      expect(!r.ok && r.message.length).toBeGreaterThan(0);
    }
  });

  it('drops query strings and fragments rather than refusing them', () => {
    expect(parse('acme.com/blog?utm=1#top').url).toBe('https://acme.com/blog');
  });
});

describe('describeDestination', () => {
  it('says what happens to the rest of the site', () => {
    expect(describeDestination(parse('acme.com/blog'))).toContain('rest of the site');
    expect(describeDestination(parse('blog.acme.com'))).toContain('separate from your main site');
  });

  /**
   * A bare domain can't hold a CNAME, and the gateway turns it down. This line
   * runs before anything has been asked of the gateway, so it describes the
   * address and defers the ruling rather than promising a homepage it can't
   * deliver.
   */
  it('does not promise a bare domain will work', () => {
    const copy = describeDestination(parse('acme.com'));
    expect(copy).toContain('acme.com');
    expect(copy).toMatch(/next step/i);
    expect(copy).not.toMatch(/homepage/i);
  });
});
