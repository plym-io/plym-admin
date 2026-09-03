import { syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  Prec,
  type ChangeSpec,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { parseColonBlocks, type ColonBlock } from './colon-blocks';
import { tableIsRendered } from './table-widget';
import { galleryIsRendered } from './gallery-widget';

/**
 * Editing around syntax the writer can't see.
 *
 * Rich mode never draws a marker (live-preview), which leaves the stock key
 * behaviour able to type *into* hidden syntax or delete half of it — either
 * one breaks the construct and dumps raw markdown back onto the page. This
 * extension closes those holes, and in closing them lands on the behaviour a
 * writer expects from a document editor:
 *
 * - typing at the visual start of a heading, quote, list item or callout
 *   title goes into the words, not in front of the invisible marker;
 * - Backspace at the start of a heading or list item takes the formatting
 *   off before it ever merges lines, and a merge carries the next line's
 *   marker away with the newline;
 * - Backspace just past `**bold**`, a link or `~~struck~~` unwraps the
 *   construct rather than amputating one delimiter, and deleting the last
 *   letter inside one removes the now-empty shell with it;
 * - a table or gallery is an object: deleting against it selects it first,
 *   and only a second press removes it;
 * - a callout absorbs the line deleted into its lower edge, and dissolves —
 *   markers gone, body kept — when deleted into from above.
 */

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

const QUOTE_SEG = /^ {0,3}> ?/;
const LIST_SEG = /^\s*(?:[-*+]|\d+[.)])[ \t]+/;
const HEADING_SEG = /^ {0,3}#{1,6} /;

interface Seg {
  from: number;
  to: number;
}

/** The markered prefix of a line: quote markers, then one list or heading marker. */
export function linePrefix(text: string, lineFrom: number): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  for (;;) {
    const m = QUOTE_SEG.exec(text.slice(i));
    if (!m) break;
    segs.push({ from: lineFrom + i, to: lineFrom + i + m[0].length });
    i += m[0].length;
  }
  const rest = text.slice(i);
  const m = LIST_SEG.exec(rest) ?? HEADING_SEG.exec(rest);
  if (m) segs.push({ from: lineFrom + i, to: lineFrom + i + m[0].length });
  return segs;
}

function inCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}

function colonBlocks(state: EditorState): ColonBlock[] {
  return parseColonBlocks(state.doc.toString().split('\n'));
}

/** The rendered table or gallery whose source spans `pos`, if any. */
function renderedBlockAt(state: EditorState, pos: number): Seg | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, pos === 0 ? 1 : -1);
  for (; node; node = node.parent) {
    if (node.name === 'Table' && tableIsRendered(state, node.from, node.to)) {
      return { from: node.from, to: node.to };
    }
    if (node.name === 'FencedCode' && galleryIsRendered(state, node.from, node.to)) {
      return { from: node.from, to: node.to };
    }
  }
  return null;
}

function blockEndingAt(state: EditorState, pos: number): Seg | null {
  const block = renderedBlockAt(state, pos);
  return block && block.to === pos ? block : null;
}

function blockStartingAt(state: EditorState, pos: number): Seg | null {
  if (pos === state.doc.length) return null;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (node.from !== pos) continue;
    if (node.name === 'Table' && tableIsRendered(state, node.from, node.to)) {
      return { from: node.from, to: node.to };
    }
    if (node.name === 'FencedCode' && galleryIsRendered(state, node.from, node.to)) {
      return { from: node.from, to: node.to };
    }
  }
  return null;
}

// ---- typing ----------------------------------------------------------

interface TypingTarget {
  pos: number;
  /** Inserted in front of the text — the space a bare `:::name` needs before a title. */
  lead: string;
}

/**
 * Where a plain insertion at `pos` should really land. `null` means the
 * position is already fine.
 */
export function typingTarget(state: EditorState, pos: number): TypingTarget | null {
  const line = state.doc.lineAt(pos);
  if (inCode(state, line.from)) return null;

  const blocks = colonBlocks(state);
  // A closing `:::` line is entirely invisible; words meant for it belong to
  // the body line above.
  const closer = blocks.find((b) => b.close === line.number - 1);
  if (closer) return line.from > 0 ? { pos: line.from - 1, lead: '' } : null;

  const opener = blocks.find((b) => b.open === line.number - 1);
  if (opener) {
    if (opener.title) {
      const zone = line.from + opener.titleAt;
      return pos < zone ? { pos: zone, lead: '' } : null;
    }
    // Words typed anywhere on a bare `:::name` line become its title.
    if (pos > line.to) return null;
    return { pos: line.to, lead: line.text.endsWith(' ') ? '' : ' ' };
  }

  const segs = linePrefix(line.text, line.from);
  if (segs.length === 0) return null;
  const end = segs[segs.length - 1].to;
  return pos < end ? { pos: end, lead: '' } : null;
}

/**
 * Reroute plain typing that would land inside hidden syntax. One change, no
 * newline, cursor selection — anything richer passes through untouched.
 */
const typeThroughSyntax = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input.type')) return tr;
  let only: { from: number; to: number; text: string } | null = null;
  let count = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    count++;
    only = { from: fromA, to: toA, text: inserted.toString() };
  });
  if (count !== 1 || !only) return tr;
  const { from, to, text } = only as { from: number; to: number; text: string };
  if (from !== to || text.includes('\n')) return tr;
  const state = tr.startState;

  const before = blockEndingAt(state, from);
  if (before) {
    return [
      {
        changes: { from, insert: '\n' + text },
        selection: EditorSelection.cursor(from + 1 + text.length),
        userEvent: 'input.type',
      },
    ];
  }
  const after = blockStartingAt(state, from);
  if (after) {
    return [
      {
        changes: { from, insert: text + '\n' },
        selection: EditorSelection.cursor(from + text.length),
        userEvent: 'input.type',
      },
    ];
  }

  const target = typingTarget(state, from);
  if (target === null || (target.pos === from && target.lead === '')) return tr;
  const insert = target.lead + text;
  return [
    {
      changes: { from: target.pos, insert },
      selection: EditorSelection.cursor(target.pos + insert.length),
      userEvent: 'input.type',
    },
  ];
});

// ---- inline constructs ----------------------------------------------

const INLINE = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough', 'InlineCode', 'Link']);

function childMarks(node: SyntaxNode): Seg[] {
  const marks: Seg[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith('Mark')) marks.push({ from: child.from, to: child.to });
  }
  return marks;
}

/** The visible words of an inline construct. */
function contentOf(state: EditorState, node: SyntaxNode): Seg | null {
  if (node.name === 'Link') {
    const m = /^\[([^\]]*)\]/.exec(state.sliceDoc(node.from, node.to));
    return m ? { from: node.from + 1, to: node.from + 1 + m[1].length } : null;
  }
  const marks = childMarks(node);
  if (marks.length < 2) return null;
  return { from: marks[0].to, to: marks[marks.length - 1].from };
}

/** Take the construct's delimiters off and keep its words. */
export function unwrapInline(state: EditorState, node: SyntaxNode): TransactionSpec | null {
  const content = contentOf(state, node);
  if (!content) return null;
  const changes: ChangeSpec[] = [
    { from: node.from, to: content.from },
    { from: content.to, to: node.to },
  ];
  const shift = content.from - node.from;
  return {
    changes,
    selection: EditorSelection.cursor(content.to - shift),
    userEvent: 'delete',
  };
}

/** The innermost inline construct around `pos`, entered from `side`. */
function inlineAt(state: EditorState, pos: number, side: -1 | 1): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
  for (; node; node = node.parent) {
    if (INLINE.has(node.name)) return node;
  }
  return null;
}

/** The link whose source spans `pos`, if any — for the URL popover. */
export function linkAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; label: string; urlFrom: number; urlTo: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; node; node = node.parent) {
    if (node.name === 'Link') break;
  }
  if (!node) return null;
  const m = /^\[([^\]]*)\]\((.*)\)$/s.exec(state.sliceDoc(node.from, node.to));
  if (!m) return null;
  const urlFrom = node.from + 1 + m[1].length + 2;
  return {
    from: node.from,
    to: node.to,
    label: m[1],
    urlFrom,
    urlTo: urlFrom + m[2].length,
  };
}

/** Remove the link markup around `pos`, keeping the label. */
export function unlinkAt(state: EditorState, pos: number): TransactionSpec | null {
  const link = linkAt(state, pos);
  if (!link) return null;
  return {
    changes: [
      { from: link.from, to: link.from + 1 },
      { from: link.from + 1 + link.label.length, to: link.to },
    ],
    selection: EditorSelection.cursor(link.from + link.label.length),
    userEvent: 'delete',
  };
}

function inlineBackspace(state: EditorState, pos: number): TransactionSpec | null {
  const node = inlineAt(state, pos, -1);
  if (!node) return null;
  if (node.to === pos) return unwrapInline(state, node);
  const content = contentOf(state, node);
  // Deleting the construct's last visible character: the empty shell would
  // survive as raw delimiters, so it goes too.
  if (content && content.to === pos && content.to - content.from === 1) {
    return {
      changes: { from: node.from, to: node.to },
      selection: EditorSelection.cursor(node.from),
      userEvent: 'delete',
    };
  }
  return null;
}

function inlineDelete(state: EditorState, pos: number): TransactionSpec | null {
  const node = inlineAt(state, pos, 1);
  if (!node) return null;
  if (node.from === pos) return unwrapInline(state, node);
  const content = contentOf(state, node);
  if (content && content.from === pos && content.to - content.from === 1) {
    return {
      changes: { from: node.from, to: node.to },
      selection: EditorSelection.cursor(node.from),
      userEvent: 'delete',
    };
  }
  return null;
}

// ---- colon blocks ----------------------------------------------------

/**
 * Take the block apart and leave its body: the opener keeps only its title
 * text, the closer goes entirely.
 */
function dissolveColon(state: EditorState, block: ColonBlock): TransactionSpec {
  const open = state.doc.line(block.open + 1);
  const close = state.doc.line(block.close + 1);
  const changes: ChangeSpec[] = [];
  if (block.title) {
    changes.push({ from: open.from, to: open.from + block.titleAt });
  } else {
    changes.push({ from: open.from, to: Math.min(open.to + 1, state.doc.length) });
  }
  changes.push({ from: Math.max(0, close.from - 1), to: close.to });
  return { changes, userEvent: 'delete' };
}

/** Move the closing `:::` below `line`, pulling the line into the block. */
function absorbIntoColon(
  closeLine: { from: number; text: string },
  line: { from: number; to: number },
  caret: number,
): TransactionSpec {
  return {
    changes: [
      { from: closeLine.from, to: line.from },
      { from: line.to, insert: '\n' + closeLine.text },
    ],
    selection: EditorSelection.cursor(caret),
    userEvent: 'delete',
  };
}

// ---- backspace and delete -------------------------------------------

export function backspaceSpec(state: EditorState): TransactionSpec | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const pos = sel.head;
  const line = state.doc.lineAt(pos);
  if (inCode(state, Math.max(pos - 1, 0))) return null;

  const block = blockEndingAt(state, pos);
  if (block) return { selection: EditorSelection.range(block.from, block.to) };

  const inline = inlineBackspace(state, pos);
  if (inline) return inline;

  const blocks = colonBlocks(state);
  const opener = blocks.find((b) => b.open === line.number - 1);
  if (opener && pos <= line.from + opener.titleAt) return dissolveColon(state, opener);

  // The caret can sit before or after a hidden marker and look the same, so
  // both read as "at the visual start": formatting comes off first, and only
  // an unmarked line merges up.
  const segs = linePrefix(line.text, line.from);
  if (pos > line.from) {
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (pos > seg.from && pos <= seg.to) {
        return {
          changes: { from: seg.from, to: seg.to },
          selection: EditorSelection.cursor(seg.from),
          userEvent: 'delete',
        };
      }
    }
    return null;
  }

  if (segs.length > 0) {
    const seg = segs[segs.length - 1];
    return {
      changes: { from: seg.from, to: seg.to },
      selection: EditorSelection.cursor(seg.from),
      userEvent: 'delete',
    };
  }

  if (line.number === 1) return null;
  const prev = state.doc.line(line.number - 1);

  // A rendered table or gallery above — even across the blank line that
  // keeps this paragraph out of it — is an object: select it, don't eat
  // into its source.
  const prevBlock =
    blockEndingAt(state, prev.to) ??
    (prev.length === 0 && prev.number > 1
      ? blockEndingAt(state, state.doc.line(prev.number - 1).to)
      : null);
  if (prevBlock) return { selection: EditorSelection.range(prevBlock.from, prevBlock.to) };

  const closed = blocks.find((b) => b.close === prev.number - 1);
  if (closed) return absorbIntoColon(prev, line, prev.from);
  const opened = blocks.find((b) => b.open === prev.number - 1);
  // Backspacing the first body line into an untitled opener would corrupt
  // the invisible `:::name`; the block dissolves instead. A titled opener
  // merges like any text line — everything after `:::name ` is title.
  if (opened && !opened.title) return dissolveColon(state, opened);

  return null;
}

export function deleteSpec(state: EditorState): TransactionSpec | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const pos = sel.head;
  if (pos === state.doc.length) return null;
  const line = state.doc.lineAt(pos);
  if (inCode(state, pos)) return null;

  const block = blockStartingAt(state, pos);
  if (block) return { selection: EditorSelection.range(block.from, block.to) };

  const inline = inlineDelete(state, pos);
  if (inline) return inline;

  if (pos < line.to || line.number === state.doc.lines) return null;
  const next = state.doc.line(line.number + 1);

  const nextBlock =
    blockStartingAt(state, next.from) ??
    (next.length === 0 && next.number < state.doc.lines
      ? blockStartingAt(state, state.doc.line(next.number + 1).from)
      : null);
  if (nextBlock) return { selection: EditorSelection.range(nextBlock.from, nextBlock.to) };

  const blocks = colonBlocks(state);
  const opened = blocks.find((b) => b.open === next.number - 1);
  if (opened) return dissolveColon(state, opened);
  const closed = blocks.find((b) => b.close === next.number - 1);
  if (closed && next.number < state.doc.lines) {
    const after = state.doc.line(next.number + 1);
    return absorbIntoColon(next, after, line.to);
  }

  const segs = linePrefix(next.text, next.from);
  if (segs.length === 0) return null;
  return {
    changes: { from: line.to, to: segs[segs.length - 1].to },
    selection: EditorSelection.cursor(line.to),
    userEvent: 'delete',
  };
}

const runSpec =
  (spec: (state: EditorState) => TransactionSpec | null) => (view: EditorView) => {
    const tr = spec(view.state);
    if (!tr) return false;
    view.dispatch(tr);
    return true;
  };

/** Registered by live-preview, so it exists exactly when the syntax is hidden. */
export const syntaxEdits: Extension = [
  typeThroughSyntax,
  Prec.high(
    keymap.of([
      { key: 'Backspace', run: runSpec(backspaceSpec) },
      { key: 'Delete', run: runSpec(deleteSpec) },
    ]),
  ),
];
