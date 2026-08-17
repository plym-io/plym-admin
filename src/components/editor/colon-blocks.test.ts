import { describe, it, expect } from 'vitest';
import { defaultTitle, parseColonBlocks } from './colon-blocks';

/**
 * The cases here are the renderer's own (`tests/test_markdown_extensions.py`),
 * rewritten as questions about what the editor should draw. Where the renderer
 * raises, the editor's answer is "nothing" — a box around a post the API will
 * reject would be a lie told in advance.
 */
const parse = (source: string) => parseColonBlocks(source.split('\n'));

describe('admonitions', () => {
  it('finds a block and the lines it spans', () => {
    expect(parse(':::warning\nsome warning here\n:::')).toEqual([
      {
        name: 'warning',
        title: '',
        kind: 'admonition',
        open: 0,
        close: 2,
        titleAt: 10,
        depth: 0,
      },
    ]);
  });

  it('keeps the title written after the type', () => {
    const [block] = parse(':::tip Pro tip\nbody\n:::');
    expect(block.title).toBe('Pro tip');
    // Everything before the title is syntax, and that is what gets hidden.
    expect(':::tip Pro tip'.slice(block.titleAt)).toBe('Pro tip');
  });

  it('falls back to the type as the title, exactly as the renderer does', () => {
    expect(parse(':::note\nbody\n:::')[0].title).toBe('');
    expect(defaultTitle('note')).toBe('Note');
  });

  it('needs no blank line around it', () => {
    expect(parse('intro\n:::note\nbody\n:::\nafter')[0]).toMatchObject({ open: 1, close: 3 });
  });

  it('nests, innermost first, with the depth that decides the tint', () => {
    const blocks = parse(':::note Outer\n:::tip Inner\ndeep\n:::\n:::');
    expect(blocks.map((b) => [b.name, b.depth, b.open, b.close])).toEqual([
      ['tip', 1, 1, 3],
      ['note', 0, 0, 4],
    ]);
  });

  it('leaves a name the renderer does not know as plain text', () => {
    expect(parse(':::info\nhello\n:::')).toEqual([]);
  });

  it('still counts an unknown opener when looking for the close', () => {
    // The renderer counts colon fences, not names. If this didn't, the note
    // would close on the inner `:::` and the tint would stop three lines early.
    const [block] = parse(':::note\n:::info\nx\n:::\n:::');
    expect(block).toMatchObject({ name: 'note', open: 0, close: 4 });
  });

  it('draws nothing for a block that was never closed', () => {
    expect(parse(':::warning\nno close here')).toEqual([]);
  });

  it('ignores a stray close', () => {
    expect(parse(':::note\nbody\n:::\n:::')).toHaveLength(1);
  });

  it('accepts up to three spaces of indent', () => {
    expect(parse('   :::note\nbody\n   :::')).toHaveLength(1);
    expect(parse('    :::note\nbody\n    :::')).toEqual([]);
  });
});

describe('code fences', () => {
  it('leaves a colon fence inside a code block alone', () => {
    expect(parse('```\n:::warning\nnot a block\n```')).toEqual([]);
  });

  it('leaves one inside a tilde fence alone too', () => {
    expect(parse('~~~\n:::warning\nnope\n~~~')).toEqual([]);
  });

  it('does not let a fence of the other character close the block', () => {
    expect(parse('```\n:::note\n~~~\nstill code\n```')).toEqual([]);
  });

  it('reads blocks again after the fence closes', () => {
    expect(parse('```\n:::note\n```\n\n:::tip\nreal\n:::')[0].name).toBe('tip');
  });

  it('leaves an escaped fence as text', () => {
    // `md.ESCAPED_CHARS` gets a colon, so `\:::` never opens anything.
    expect(parse('\\:::warning\nplain\n\\:::')).toEqual([]);
  });
});

describe('tabs', () => {
  const tabs = (count: number) =>
    `:::tabs\n${Array.from({ length: count }, (_, i) => `:::tab T${i}\nbody ${i}\n:::`).join('\n')}\n:::`;

  it('reports the set and each pane in it', () => {
    const blocks = parse(tabs(2));
    expect(blocks.map((b) => [b.kind, b.title])).toEqual([
      ['tab', 'T0'],
      ['tab', 'T1'],
      ['tabs', ''],
    ]);
  });

  it('will not draw a pane outside a set', () => {
    // The renderer rejects this one outright (MisplacedTabError).
    expect(parse(':::tab Lonely\nbody\n:::')).toEqual([]);
  });

  it('keeps a code fence inside a pane from swallowing the pane', () => {
    const blocks = parse(':::tabs\n:::tab Python\n```python\nprint("hi")\n```\n:::\n:::');
    expect(blocks.map((b) => b.kind)).toEqual(['tab', 'tabs']);
  });

  it('renders an admonition inside a pane', () => {
    const blocks = parse(':::tabs\n:::tab A\n:::warning\ncareful\n:::\n:::\n:::');
    expect(blocks.map((b) => b.name)).toEqual(['warning', 'tab', 'tabs']);
  });
});
