import { describe, it, expect } from 'vitest';
import { deriveExcerpt } from './excerpt';

describe('deriveExcerpt', () => {
  it('takes the opening paragraph, not the heading above it', () => {
    expect(
      deriveExcerpt('# A title\n\nThe first thing the post actually says.\n\nMore later.'),
    ).toBe('The first thing the post actually says.');
  });

  it('joins the wrapped lines of one paragraph and stops at the blank line', () => {
    expect(deriveExcerpt('One line\nand its continuation.\n\nA second paragraph.')).toBe(
      'One line and its continuation.',
    );
  });

  it('unwraps links and drops emphasis markers', () => {
    expect(
      deriveExcerpt('We shipped [the panel](https://plym.io/blog) with **real** _tests_.'),
    ).toBe('We shipped the panel with real tests.');
  });

  it('skips code fences entirely', () => {
    expect(deriveExcerpt('```bash\nrm -rf /\n```\n\nThe prose after the fence.')).toBe(
      'The prose after the fence.',
    );
  });

  it('skips a gallery fence, which is a fence like any other in plym', () => {
    expect(
      deriveExcerpt('```gallery\n![a](/a.png)\n![b](/b.png)\n```\n\nWhat the gallery shows.'),
    ).toBe('What the gallery shows.');
  });

  it('does not take its text from a ::: admonition', () => {
    expect(deriveExcerpt(':::note Heads up\nRead this first.\n:::\n\nThe real opening.')).toBe(
      'The real opening.',
    );
  });

  it('skips tables and lone images', () => {
    expect(
      deriveExcerpt('![cover](/c.png)\n\n| a | b |\n| - | - |\n\nProse at last.'),
    ).toBe('Prose at last.');
  });

  it('falls back to a list item when the post opens with one', () => {
    expect(deriveExcerpt('- First point\n- Second point')).toBe('First point Second point');
  });

  it('strips a blockquote marker but keeps the quote', () => {
    expect(deriveExcerpt('> Something someone said.')).toBe('Something someone said.');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const result = deriveExcerpt(`${'alpha '.repeat(40)}omega`);
    expect(result.length).toBeLessThanOrEqual(156);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/alph…$/);
  });

  it('leaves a short paragraph exactly as written', () => {
    expect(deriveExcerpt('Short and done.')).toBe('Short and done.');
  });

  it('is empty when there is no prose to take', () => {
    expect(deriveExcerpt('')).toBe('');
    expect(deriveExcerpt('# Only a heading')).toBe('');
    expect(deriveExcerpt('```\njust code\n```')).toBe('');
  });

  it('unescapes markdown escapes rather than showing the backslashes', () => {
    expect(deriveExcerpt('A 50\\% discount on \\*everything\\*.')).toBe(
      'A 50% discount on *everything*.',
    );
  });
});
