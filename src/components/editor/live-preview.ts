import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { tableIsRendered, tablePreview } from './table-widget';

/**
 * "WYSIWYG" over a markdown document, the way Obsidian and Typora do it: the
 * document stays markdown — the source of truth never changes — and the
 * *rendering* of the syntax changes. Headings get heading sizes, `**bold**`
 * reads bold, images show, and the markers themselves fade out until the
 * caret enters that construct, at which point the raw text comes back so you
 * can edit it.
 *
 * The alternative — a rich-text surface serialising back to markdown — loses
 * whatever it doesn't model (front matter, raw HTML, footnotes, its own
 * formatting preferences) on every round trip. For a CMS whose files *are*
 * markdown, that trade isn't worth making.
 */

const HEADING = /^ATXHeading(\d)$/;
const SETEXT = /^SetextHeading(\d)$/;

/** Markers that vanish while the caret is elsewhere. */
const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'QuoteMark',
]);

const hidden = Decoration.replace({});

const line = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });

const EM = mark('cm-md-em');
const STRONG = mark('cm-md-strong');
const STRIKE = mark('cm-md-strike');
const CODE = mark('cm-md-code');
const LINK = mark('cm-md-link');
const LIST_MARK = mark('cm-md-list-mark');
const URL_MARK = mark('cm-md-url');

const BULLET = /^[-*+]$/;

/** The `-` of a bullet list, drawn as a bullet. */
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = '•';
    return span;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-image';
    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    // The image's height isn't known until it loads; without this the lines
    // below it stay where the placeholder was and the caret sits off-target.
    img.addEventListener('load', () => view.requestMeasure());
    wrap.appendChild(img);
    return wrap;
  }

  /** Let clicks through, so clicking an image drops the caret into its source. */
  ignoreEvent() {
    return false;
  }

  get estimatedHeight() {
    return 200;
  }
}

/** True when the selection is inside (or touching) this range — reveal source. */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** True when the selection actually reaches into this range (touching doesn't count). */
function selectionInside(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from < to && r.to > from);
}

/** True when the selection sits on any line this range covers. */
function selectionOnLines(state: EditorState, from: number, to: number): boolean {
  const start = state.doc.lineAt(from).from;
  const end = state.doc.lineAt(to).to;
  return selectionTouches(state, start, end);
}

const IMAGE = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)$/;

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const decos: Range<Decoration>[] = [];

  /** Add a line decoration to every line the range spans. */
  const eachLine = (from: number, to: number, deco: Decoration) => {
    let pos = from;
    while (pos <= to) {
      const l = state.doc.lineAt(pos);
      decos.push(deco.range(l.from));
      if (l.to >= to) break;
      pos = l.to + 1;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        const heading = HEADING.exec(name) ?? SETEXT.exec(name);
        if (heading) {
          eachLine(node.from, node.to, line(`cm-md-h${heading[1]}`));
          return;
        }

        switch (name) {
          case 'Emphasis':
            decos.push(EM.range(node.from, node.to));
            return;
          case 'StrongEmphasis':
            decos.push(STRONG.range(node.from, node.to));
            return;
          case 'Strikethrough':
            decos.push(STRIKE.range(node.from, node.to));
            return;
          case 'InlineCode':
            decos.push(CODE.range(node.from, node.to));
            return;
          case 'Blockquote':
            eachLine(node.from, node.to, line('cm-md-quote'));
            return;
          case 'FencedCode':
          case 'CodeBlock':
            eachLine(node.from, node.to, line('cm-md-codeblock'));
            return;
          case 'Table':
            // A table with the caret outside it is drawn as a real grid by
            // the table field; leave both it and its cells alone.
            if (tableIsRendered(state, node.from, node.to)) return false;
            eachLine(node.from, node.to, line('cm-md-table'));
            return;
          case 'HorizontalRule':
            eachLine(node.from, node.to, line('cm-md-hr'));
            return;
          case 'ListMark': {
            const src = state.doc.sliceString(node.from, node.to);
            // A bullet reads as a bullet; "1." is already what it should be.
            if (
              BULLET.test(src) &&
              !selectionOnLines(state, node.from, node.to)
            ) {
              decos.push(
                Decoration.replace({ widget: new BulletWidget() }).range(
                  node.from,
                  node.to,
                ),
              );
            } else {
              decos.push(LIST_MARK.range(node.from, node.to));
            }
            return;
          }
          case 'Link':
            decos.push(LINK.range(node.from, node.to));
            return;
          case 'URL': {
            // Inside a []() the target is noise once the label reads as a
            // link; on its own (an autolink) it *is* the text.
            const link = node.node.parent;
            if (link?.name === 'Link' && !selectionTouches(state, link.from, link.to)) {
              decos.push(hidden.range(node.from, node.to));
            } else {
              decos.push(URL_MARK.range(node.from, node.to));
            }
            return;
          }
          case 'Image': {
            if (selectionTouches(state, node.from, node.to)) return false;
            const m = IMAGE.exec(state.doc.sliceString(node.from, node.to));
            // An empty URL is an upload still in flight — leave it as text.
            if (!m) return false;
            decos.push(
              Decoration.replace({
                widget: new ImageWidget(m[2], m[1]),
              }).range(node.from, node.to),
            );
            return false;
          }
        }

        if (!MARKS.has(name)) return;

        const parent = node.node.parent;
        // A fence is the only thing telling you where a code block ends, and
        // hiding it would leave a bare empty line. Inline backticks go.
        if (name === 'CodeMark' && parent?.name !== 'InlineCode') return;

        // How far the caret has to be for a marker to hide:
        //  · heading/quote — off the line entirely, so `##` doesn't flicker
        //    back mid-word;
        //  · link — outside the whole link, so the brackets and the URL they
        //    hide always come back together;
        //  · emphasis, strike, code — actually inside the word. Sitting at
        //    either end of a bold run isn't editing it, so the asterisks
        //    stay hidden as you write past them.
        const scope = parent ?? node.node;
        const away =
          name === 'HeaderMark' || name === 'QuoteMark'
            ? !selectionOnLines(state, scope.from, scope.to)
            : name === 'LinkMark'
              ? !selectionTouches(state, scope.from, scope.to)
              : !selectionInside(state, scope.from, scope.to);
        if (!away) return;

        // `## ` — the separating space goes with the hashes, or the heading
        // would render with a leading gap.
        const end =
          name === 'HeaderMark' && state.doc.sliceString(node.to, node.to + 1) === ' '
            ? node.to + 1
            : node.to;
        if (end > node.from) decos.push(hidden.range(node.from, end));
      },
    });
  }

  return Decoration.set(decos, true);
}

/**
 * Token colours for both modes. CodeMirror's stock style is built for code —
 * among other things it underlines every heading, which in a prose editor
 * reads as a mistake. This replaces it: quiet colour, no decoration, and the
 * syntax characters themselves greyed back so the words carry the page.
 */
export const proseHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, textDecoration: 'none', fontWeight: '700' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: 'var(--color-fg)' },
    { tag: t.url, color: 'var(--color-fg-subtle)' },
    { tag: t.quote, color: 'var(--color-fg-muted)' },
    // The `#`, `**` and `>` characters — present in source mode, faded.
    { tag: t.processingInstruction, color: 'var(--color-fg-subtle)' },
    { tag: t.contentSeparator, color: 'var(--color-fg-subtle)' },
    { tag: t.keyword, color: 'var(--color-fg-muted)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--color-success)' },
    { tag: t.comment, color: 'var(--color-fg-subtle)', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null], color: 'var(--color-warning)' },
    { tag: [t.definition(t.variableName), t.function(t.variableName)], color: 'var(--color-fg)' },
  ]),
);

const inlinePreview: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(u: ViewUpdate) {
      // Selection matters as much as content here: moving the caret is what
      // reveals and re-hides the markers.
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Rendered markdown, live. Not registered at all in source mode, so the raw
 * document is exactly what you see. Tables come from their own state field:
 * a block widget can't be produced by a view plugin.
 */
export const livePreview: Extension = [tablePreview, inlinePreview];
