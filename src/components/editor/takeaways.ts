import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

/**
 * "Key takeaways" — the summary card, drawn in the editor.
 *
 * There is no new syntax under it, and nothing new on the published page: the
 * card is a blockquote that opens with a line of its own and continues as
 * bullets, which the renderer already turns into a quote around a list. All
 * this adds is the drawing, so the construct stops reading as a pull-quote
 * while it is being written.
 *
 * Which is why it matches on the shape and never on the words. The heading is
 * ordinary editable text — "Key takeaways" is only what the slash command
 * happens to type — so keying off it would mean renaming the card deleted it.
 */

/** `> anything`, with the marker and its one optional space taken off. */
const QUOTE = /^ {0,3}> ?(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** A bullet item, including one still empty. `---` is a rule, not an item. */
const BULLET = /^ {0,3}[-*+]([ \t].*)?$/;
/** An indented line carrying on from the item above it. */
const CONTINUATION = /^[ \t]+\S/;

export interface Takeaways {
  /** 0-based line indexes of the heading and of the quote's last line. */
  open: number;
  close: number;
}

function isHeading(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed !== '' &&
    !BULLET.test(text) &&
    !trimmed.startsWith('#') &&
    !trimmed.startsWith('>')
  );
}

/**
 * A quote is a takeaways card when a heading opens it and bullets are all it
 * holds. Anything else — a second paragraph, a numbered list, a nested quote —
 * is someone quoting someone, and gets left alone.
 */
function isTakeaways(body: string[]): boolean {
  if (body.length === 0 || !isHeading(body[0])) return false;
  let bullets = 0;
  for (const text of body.slice(1)) {
    if (text.trim() === '') continue;
    if (BULLET.test(text)) {
      bullets++;
      continue;
    }
    if (!CONTINUATION.test(text)) return false;
  }
  return bullets > 0;
}

/** Every takeaways card in the document, in the order they appear. */
export function parseTakeaways(lines: string[]): Takeaways[] {
  const cards: Takeaways[] = [];
  let fence: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const text = lines[index];
    const marker = FENCE.exec(text)?.[1];

    if (fence !== null) {
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        text.trim() === marker
      ) {
        fence = null;
      }
      index++;
      continue;
    }
    if (marker) {
      fence = marker;
      index++;
      continue;
    }
    if (!QUOTE.test(text)) {
      index++;
      continue;
    }

    const open = index;
    const body: string[] = [];
    while (index < lines.length) {
      const quoted = QUOTE.exec(lines[index]);
      if (!quoted) break;
      body.push(quoted[1]);
      index++;
    }
    if (isTakeaways(body)) cards.push({ open, close: index - 1 });
  }

  return cards;
}

function build(state: EditorState): DecorationSet {
  const cards = parseTakeaways(state.doc.toString().split('\n'));
  if (cards.length === 0) return Decoration.none;

  const decos: Range<Decoration>[] = [];
  for (const card of cards) {
    for (let index = card.open; index <= card.close; index++) {
      const classes = ['cm-md-tk'];
      if (index === card.open) classes.push('cm-md-tk-open');
      if (index === card.close) classes.push('cm-md-tk-close');
      decos.push(
        Decoration.line({ class: classes.join(' ') }).range(
          state.doc.line(index + 1).from,
        ),
      );
    }
  }

  return Decoration.set(decos, true);
}

/**
 * A field rather than a view plugin, for the reason the `:::` blocks use one:
 * a card is decided by lines the viewport may not hold, and the top of one has
 * to be drawn before it has been scrolled into view.
 */
export const takeawaysPreview: Extension = StateField.define<DecorationSet>({
  create: build,
  update: (decos, tr) => (tr.docChanged ? build(tr.state) : decos),
  provide: (f) => EditorView.decorations.from(f),
});
