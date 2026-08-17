import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * The formatting the toolbar, the context menu and ⌘B/⌘I all run. They're
 * plain document edits — the file stays markdown — so they live here as pure
 * `state → TransactionSpec` functions and get unit-tested without a DOM.
 */

export const BOLD = '**';
export const ITALIC = '_';
export const STRIKE = '~~';
export const CODE = '`';

const WORD = /[\w'’-]/;

/** The word under an empty cursor, so ⌘B with no selection bolds a word. */
function wordAt(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  let from = pos - line.from;
  let to = from;
  while (from > 0 && WORD.test(text[from - 1])) from--;
  while (to < text.length && WORD.test(text[to])) to++;
  return { from: line.from + from, to: line.from + to };
}

/**
 * Add the marker pair around the selection, or take it off when it's already
 * there — either just inside the selection (`**bold**` selected whole) or
 * just outside it (`**bold**` with only the word selected).
 */
export function toggleInline(state: EditorState, mark: string): TransactionSpec {
  const len = mark.length;
  return state.changeByRange((range) => {
    let { from, to } = range;
    if (from === to) ({ from, to } = wordAt(state, from));

    const inner = state.sliceDoc(from, to);

    if (
      inner.length >= len * 2 &&
      inner.startsWith(mark) &&
      inner.endsWith(mark)
    ) {
      const text = inner.slice(len, inner.length - len);
      return {
        changes: { from, to, insert: text },
        range: EditorSelection.range(from, from + text.length),
      };
    }

    if (
      state.sliceDoc(Math.max(0, from - len), from) === mark &&
      state.sliceDoc(to, Math.min(state.doc.length, to + len)) === mark
    ) {
      return {
        changes: [
          { from: from - len, to: from },
          { from: to, to: to + len },
        ],
        range: EditorSelection.range(from - len, to - len),
      };
    }

    return {
      changes: { from, to, insert: mark + inner + mark },
      range: inner
        ? EditorSelection.range(from + len, from + len + inner.length)
        : EditorSelection.cursor(from + len),
    };
  });
}

const URLISH = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * Wrap the selection in a link. Selecting a URL puts the caret in the label;
 * selecting words (or nothing) selects the placeholder URL so it can be typed
 * or pasted straight over.
 */
export function insertLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const { from, to } = range;
    const text = state.sliceDoc(from, to).trim();
    const isUrl = URLISH.test(text);
    const label = isUrl ? '' : text;
    const url = isUrl ? text : 'https://';
    const insert = `[${label}](${url})`;
    const urlStart = from + label.length + 3;
    return {
      changes: { from, to, insert },
      range: isUrl
        ? EditorSelection.cursor(from + 1)
        : EditorSelection.range(urlStart, urlStart + url.length),
    };
  });
}

/**
 * The newlines a block construct needs in front of it to start its own block
 * at `pos`. Markdown keeps reading the paragraph you are in otherwise, so a
 * table or a `:::` fence typed mid-sentence would join it rather than open.
 */
export function blockLead(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos);
  if (state.sliceDoc(line.from, pos).trim() !== '') return '\n\n';
  return line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '' ? '\n' : '';
}

/** Dispatch a spec and hand focus back to the writing surface. */
export function run(view: EditorView, spec: TransactionSpec) {
  view.dispatch(spec);
  view.focus();
}
