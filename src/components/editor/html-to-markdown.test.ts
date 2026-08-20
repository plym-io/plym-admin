import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, isWorthConverting } from './html-to-markdown';

/**
 * `google-docs-export.html` is a real Google document exported through the
 * Drive API — Google's own serialiser, not a hand-written approximation.
 * `google-docs-clipboard.html` is that same markup with the three differences
 * the clipboard flavour carries: the guid-bearing `<b style="font-weight:
 * normal">` wrapper, a `<p>` inside every `<li>`, and remote image URLs in
 * place of base64. `word.html` is built from Word 2016's documented output —
 * there is no copy of Word here to capture one from, which is the weakest
 * evidence in this file and the first thing to re-check against a real paste.
 */
const fixture = (name: string): string =>
  readFileSync(`src/components/editor/__fixtures__/${name}.html`, 'utf8');

const GOOGLE = ['google-docs-export', 'google-docs-clipboard'] as const;

describe.each(GOOGLE)('Google Docs (%s)', (name) => {
  const { markdown } = htmlToMarkdown(fixture(name));

  it('keeps headings at their own level', () => {
    expect(markdown).toContain('# Pasting from Google Docs');
    expect(markdown).toContain('## Why it breaks');
    expect(markdown).toContain('### The details');
  });

  it('does not turn the whole document bold', () => {
    // Docs wraps every copied selection in `<b style="font-weight:normal">`.
    expect(markdown.startsWith('**')).toBe(false);
    expect(markdown).toContain('Google wraps the whole selection in a bold tag');
    expect(markdown).not.toContain('**Google wraps');
  });

  it('reads emphasis out of the inline styles Docs uses instead of tags', () => {
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('**_bold italic_**');
    expect(markdown).toContain('~~strikethrough~~');
  });

  it('unwraps the google.com/url redirect around every link', () => {
    expect(markdown).toContain('[plym](https://plym.io/blog)');
    expect(markdown).not.toContain('google.com/url');
  });

  it('nests the sibling lists Docs emits flat', () => {
    expect(markdown).toContain('- First bullet\n- Second bullet with **bold** in it\n  - Nested bullet');
  });

  it('keeps a numbered list numbered and separate from the bullets', () => {
    expect(markdown).toContain('1. First numbered\n2. Second numbered');
  });

  it('writes list markers the way the editor writes them', () => {
    expect(markdown).not.toMatch(/^-\s{2,}/m);
  });

  it('reads a monospace run as inline code', () => {
    expect(markdown).toContain('`inline code`');
  });

  it('serialises the table the way the table widget would', () => {
    expect(markdown).toContain(
      '| Field   | Type   | Notes            |\n' +
        '| ------- | ------ | ---------------- |\n' +
        '| excerpt | string | meta description |',
    );
  });

  it('leaves no non-breaking spaces behind', () => {
    expect(markdown).not.toContain(' ');
  });
});

describe('images', () => {
  it('counts a base64 image rather than inlining megabytes of it', () => {
    const { markdown, droppedImages } = htmlToMarkdown(fixture('google-docs-export'));
    expect(droppedImages).toBe(1);
    expect(markdown).not.toContain('data:image');
  });

  it('keeps an image the post can still fetch', () => {
    const { markdown, droppedImages } = htmlToMarkdown(fixture('google-docs-clipboard'));
    expect(droppedImages).toBe(0);
    expect(markdown).toContain('![image](https://lh7-rt.googleusercontent.com/');
  });

  it("counts a Word image pointing at the author's own disk", () => {
    const { markdown, droppedImages } = htmlToMarkdown(fixture('word'));
    expect(droppedImages).toBe(1);
    expect(markdown).not.toContain('file:///');
  });
});

describe('Word', () => {
  const { markdown } = htmlToMarkdown(fixture('word'));

  it('rebuilds the lists Word emits as bulleted paragraphs', () => {
    expect(markdown).toContain('- First bullet\n- Second bullet with **bold** in it\n  - Nested bullet');
    expect(markdown).toContain('1. First numbered\n2. Second numbered');
  });

  it('leaves no bullet glyphs in the text', () => {
    expect(markdown).not.toMatch(/[·•▪]/);
  });

  it('resolves emphasis stated in the stylesheet, not inline', () => {
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('_italic_');
    expect(markdown).toContain('**_both_**');
    expect(markdown).toContain('~~struck out~~');
  });

  it('drops the mso scaffolding', () => {
    expect(markdown).not.toContain('mso-');
    expect(markdown).not.toContain('MsoNormal');
    expect(markdown).not.toContain('supportLists');
  });

  it('keeps headings and the table', () => {
    expect(markdown).toContain('# Pasting from Word');
    expect(markdown).toContain('| Field   | Type   | Notes            |');
  });
});

describe('leaving well alone', () => {
  it('is empty for HTML with no content', () => {
    expect(htmlToMarkdown('<html><body></body></html>').markdown).toBe('');
  });

  it('does not claim a paste whose HTML says no more than its plain text', () => {
    const { markdown } = htmlToMarkdown('<meta charset="utf-8"><span>just some words</span>');
    expect(isWorthConverting(markdown, 'just some words')).toBe(false);
  });

  it('claims a paste that carries structure the plain text lost', () => {
    const { markdown } = htmlToMarkdown('<h2>Title</h2><p>Body</p>');
    expect(isWorthConverting(markdown, 'Title\nBody')).toBe(true);
  });

  it('survives malformed markup instead of throwing', () => {
    expect(() => htmlToMarkdown('<p>unclosed <b>bold <i>and')).not.toThrow();
  });
});
