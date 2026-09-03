import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { BOLD, ITALIC, insertLink, toggleInline } from './format-commands';

/** Apply a spec to a doc with `[a, b]` selected, returning doc + selection. */
function apply(
  doc: string,
  [anchor, head]: [number, number],
  make: (state: EditorState) => ReturnType<typeof toggleInline>,
) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
  });
  const next = state.update(make(state)).state;
  return {
    doc: next.doc.toString(),
    selected: next.sliceDoc(
      next.selection.main.from,
      next.selection.main.to,
    ),
    cursor: next.selection.main.head,
  };
}

describe('toggleInline', () => {
  it('wraps the selection and keeps it selected', () => {
    const out = apply('one two', [4, 7], (s) => toggleInline(s, BOLD));
    expect(out.doc).toBe('one **two**');
    expect(out.selected).toBe('two');
  });

  it('unwraps when the markers are inside the selection', () => {
    const out = apply('one **two**', [4, 11], (s) => toggleInline(s, BOLD));
    expect(out.doc).toBe('one two');
    expect(out.selected).toBe('two');
  });

  it('unwraps when the markers sit just outside the selection', () => {
    const out = apply('one **two**', [6, 9], (s) => toggleInline(s, BOLD));
    expect(out.doc).toBe('one two');
    expect(out.selected).toBe('two');
  });

  it('takes the word under a bare cursor', () => {
    const out = apply('one two', [5, 5], (s) => toggleInline(s, ITALIC));
    expect(out.doc).toBe('one _two_');
  });

  it('opens an empty pair when there is no word', () => {
    const out = apply('one ', [4, 4], (s) => toggleInline(s, BOLD));
    expect(out.doc).toBe('one ****');
    expect(out.cursor).toBe(6);
  });
});

describe('insertLink', () => {
  it('makes the selection the label and leaves the caret for the popover', () => {
    const out = apply('see docs', [4, 8], (s) => insertLink(s));
    expect(out.doc).toBe('see [docs]()');
    expect(out.cursor).toBe(9);
  });

  it('treats a selected URL as the target and waits for a label', () => {
    const out = apply('https://plym.io', [0, 15], (s) => insertLink(s));
    expect(out.doc).toBe('[](https://plym.io)');
    expect(out.cursor).toBe(1);
  });
});
