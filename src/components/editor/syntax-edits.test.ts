import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { backspaceSpec, deleteSpec, linePrefix, linkAt, typingTarget, unlinkAt } from './syntax-edits';

/** `‸` marks the caret; tables need their pipes. */
function state(spec: string): EditorState {
  const cursor = spec.indexOf('‸');
  const doc = spec.replace('‸', '');
  const s = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(s, s.doc.length, 5_000);
  return s;
}

function applied(s: EditorState, spec: TransactionSpec | null) {
  if (!spec) return null;
  const next = s.update(spec).state;
  return {
    doc: next.doc.toString(),
    cursor: next.selection.main.head,
    anchor: next.selection.main.anchor,
  };
}

describe('linePrefix', () => {
  it('reads quote markers then one list or heading marker', () => {
    expect(linePrefix('> - item', 0)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
    expect(linePrefix('## Title', 10)).toEqual([{ from: 10, to: 13 }]);
    expect(linePrefix('plain', 0)).toEqual([]);
  });
});

describe('typing through hidden syntax', () => {
  it('sends typing at a heading line start into the words', () => {
    expect(typingTarget(state('‸## Title'), 0)).toEqual({ pos: 3, lead: '' });
  });

  it('sends typing on a bare callout opener into its title', () => {
    expect(typingTarget(state('‸:::note\nbody\n:::'), 0)).toEqual({
      pos: 7,
      lead: ' ',
    });
  });

  it('sends typing on a closing ::: line to the body above', () => {
    expect(typingTarget(state(':::note\nbody\n‸:::'), 13)).toEqual({
      pos: 12,
      lead: '',
    });
  });

  it('leaves ordinary positions alone', () => {
    expect(typingTarget(state('## Ti‸tle'), 5)).toBeNull();
  });
});

describe('backspace', () => {
  it('turns a heading into a paragraph at its visual start', () => {
    const s = state('## ‸Title');
    expect(applied(s, backspaceSpec(s))).toEqual({ doc: 'Title', cursor: 0, anchor: 0 });
  });

  it('takes the innermost marker off a quoted bullet', () => {
    const s = state('> - ‸item');
    expect(applied(s, backspaceSpec(s))?.doc).toBe('> item');
  });

  it('unformats first when the caret sits before the hidden marker', () => {
    const s = state('para\n‸- item');
    expect(applied(s, backspaceSpec(s))).toEqual({ doc: 'para\nitem', cursor: 5, anchor: 5 });
  });

  it('unformats a heading at the very start of the document', () => {
    const s = state('‸## Title');
    expect(applied(s, backspaceSpec(s))).toEqual({ doc: 'Title', cursor: 0, anchor: 0 });
  });

  it('unwraps bold instead of amputating one delimiter', () => {
    const s = state('a **bold**‸ b');
    expect(applied(s, backspaceSpec(s))).toEqual({ doc: 'a bold b', cursor: 6, anchor: 6 });
  });

  it('removes the empty shell with the last letter inside it', () => {
    const s = state('a **b‸** c');
    expect(applied(s, backspaceSpec(s))?.doc).toBe('a  c');
  });

  it('unlinks instead of breaking the hidden target', () => {
    const s = state('see [docs](https://x)‸');
    expect(applied(s, backspaceSpec(s))).toEqual({ doc: 'see docs', cursor: 8, anchor: 8 });
  });

  it('dissolves an untitled callout backspaced into from its body', () => {
    const s = state(':::note\n‸body\n:::');
    expect(applied(s, backspaceSpec(s))?.doc).toBe('body');
  });

  it('absorbs the line backspaced into a callout lower edge', () => {
    const s = state(':::note\nbody\n:::\n‸tail');
    expect(applied(s, backspaceSpec(s))).toEqual({
      doc: ':::note\nbody\ntail\n:::',
      cursor: 13,
      anchor: 13,
    });
  });

  it('selects a rendered table instead of eating into it', () => {
    const s = state('| a |\n| --- |\n| b |\n\n‸x');
    const out = applied(s, backspaceSpec(s));
    expect(out?.doc).toBe('| a |\n| --- |\n| b |\n\nx');
    expect(out?.anchor).toBe(0);
    expect(out?.cursor).toBe(19);
  });

  it('stays out of code blocks', () => {
    const s = state('```\n- ‸item\n```');
    expect(backspaceSpec(s)).toBeNull();
  });
});

describe('delete', () => {
  it('carries the next line marker away with the newline', () => {
    const s = state('text‸\n## Head');
    expect(applied(s, deleteSpec(s))).toEqual({ doc: 'textHead', cursor: 4, anchor: 4 });
  });

  it('unwraps a construct deleted into from its front', () => {
    const s = state('a ‸**bold** b');
    expect(applied(s, deleteSpec(s))?.doc).toBe('a bold b');
  });

  it('absorbs the line below when deleting at a callout body end', () => {
    const s = state(':::note\nbody‸\n:::\ntail');
    expect(applied(s, deleteSpec(s))).toEqual({
      doc: ':::note\nbody\ntail\n:::',
      cursor: 12,
      anchor: 12,
    });
  });

  it('dissolves a callout deleted into from above', () => {
    const s = state('text‸\n:::note\nbody\n:::');
    expect(applied(s, deleteSpec(s))?.doc).toBe('text\nbody');
  });
});

describe('links', () => {
  it('finds the label and target around a position', () => {
    const s = state('see [docs](https://x)‸');
    expect(linkAt(s, 6)).toEqual({ from: 4, to: 21, label: 'docs', urlFrom: 11, urlTo: 20 });
  });

  it('unlinks keeping the words', () => {
    const s = state('see [docs](https://x)‸');
    expect(applied(s, unlinkAt(s, 6))?.doc).toBe('see docs');
  });
});
