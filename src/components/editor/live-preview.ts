import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { tableIsRendered, tablePreview } from './table-widget';
import { galleryIsRendered, galleryPreview } from './gallery-widget';
import { colonBlockPreview } from './colon-blocks';
import { takeawaysPreview } from './takeaways';
import { syntaxEdits } from './syntax-edits';

/**
 * WYSIWYG over a markdown document: the document stays markdown — the source
 * of truth never changes — and only the *rendering* of the syntax changes.
 * Headings get heading sizes, `**bold**` reads bold, images show, and the
 * markers themselves are never drawn at all. Not on hover, not under the
 * caret: the syntax is the file format, not the writing experience.
 *
 * That makes every hidden marker something the caret could otherwise walk
 * into or half-delete, so each hidden range is also atomic (the cursor skips
 * it whole) and syntax-edits teaches typing and deletion what the invisible
 * characters mean.
 *
 * The alternative — a rich-text surface serialising back to markdown — loses
 * whatever it doesn't model (front matter, raw HTML, footnotes, its own
 * formatting preferences) on every round trip. For a CMS whose files *are*
 * markdown, that trade isn't worth making.
 */

const HEADING = /^ATXHeading(\d)$/;
const SETEXT = /^SetextHeading(\d)$/;

/** Markers that are never drawn. */
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

/** Hashes alone on a line — a heading only until the next letter kills it. */
const BARE_HEADING = /^ {0,3}#{1,6}$/;

/** `[label](…` — how far the visible words of a link run. */
const LABEL = /^\[([^\]]*)\]\(/;

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
    // The source never shows, so a click selects the image as an object —
    // highlighted, and one Backspace away from gone.
    img.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      const resolved = syntaxTree(view.state).resolveInner(pos, 1);
      let node: typeof resolved | null = resolved;
      while (node && node.name !== 'Image') node = node.parent;
      if (node) {
        view.dispatch({ selection: { anchor: node.from, head: node.to } });
        view.focus();
      }
    });
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return 200;
  }
}

const IMAGE = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)$/;

interface Built {
  decorations: DecorationSet;
  hidden: DecorationSet;
}

function build(view: EditorView): Built {
  const { state } = view;
  const decos: Range<Decoration>[] = [];
  const atoms: Range<Decoration>[] = [];

  const hide = (from: number, to: number) => {
    if (to <= from) return;
    const r = hidden.range(from, to);
    decos.push(r);
    atoms.push(r);
  };

  const replace = (from: number, to: number, deco: Decoration) => {
    const r = deco.range(from, to);
    decos.push(r);
    atoms.push(r);
  };

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
          // `##` with no space after it parses as a heading, but one more
          // letter un-parses it (`##hello` is plain text) — so the hashes
          // stay visible and the line unstyled until the space makes it a
          // heading for real. Typing `# ` converts, the way Notion does.
          if (HEADING.test(name) && BARE_HEADING.test(state.doc.lineAt(node.from).text)) {
            return;
          }
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
            // A ```gallery drawn as a strip by the gallery field is not code
            // on the page and shouldn't be dressed as code here.
            if (galleryIsRendered(state, node.from, node.to)) return false;
            eachLine(node.from, node.to, line('cm-md-codeblock'));
            return;
          case 'CodeBlock':
            eachLine(node.from, node.to, line('cm-md-codeblock'));
            return;
          case 'Table':
            // A parseable table is drawn as a grid by the table field; leave
            // both it and its cells alone.
            if (tableIsRendered(state, node.from, node.to)) return false;
            eachLine(node.from, node.to, line('cm-md-table'));
            return;
          case 'HorizontalRule':
            // The rule is the border the line class draws; the dashes that
            // put it there stay out of sight.
            eachLine(node.from, node.to, line('cm-md-hr'));
            hide(node.from, node.to);
            return false;
          case 'ListMark': {
            const src = state.doc.sliceString(node.from, node.to);
            // A bullet reads as a bullet; "1." is already what it should be.
            // A bare `-` isn't a bullet until its space arrives — `-hello`
            // is plain text, so drawing the dash as a dot would lie.
            if (
              BULLET.test(src) &&
              /[ \t]/.test(state.doc.sliceString(node.to, node.to + 1))
            ) {
              replace(node.from, node.to, Decoration.replace({ widget: new BulletWidget() }));
            } else {
              decos.push(LIST_MARK.range(node.from, node.to));
            }
            return;
          }
          case 'Link': {
            // The label is the link; the brackets and the target are hidden
            // in one piece each, title included, and the popover edits the
            // URL. Descend still — emphasis inside the label draws itself.
            decos.push(LINK.range(node.from, node.to));
            const m = LABEL.exec(state.doc.sliceString(node.from, node.to));
            if (m) {
              hide(node.from, node.from + 1);
              hide(node.from + 1 + m[1].length, node.to);
            }
            return;
          }
          case 'URL': {
            // Inside a []() the Link case has already hidden the target; on
            // its own (an autolink) it *is* the text.
            if (node.node.parent?.name !== 'Link') {
              decos.push(URL_MARK.range(node.from, node.to));
            }
            return;
          }
          case 'Image': {
            const m = IMAGE.exec(state.doc.sliceString(node.from, node.to));
            // An empty URL is an upload still in flight — leave it as text.
            if (!m) return false;
            replace(
              node.from,
              node.to,
              Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }),
            );
            return false;
          }
        }

        if (!MARKS.has(name)) return;

        const parent = node.node.parent;
        // A fence is the only thing telling you where a code block ends, and
        // hiding it would leave a bare empty line. Inline backticks go.
        if (name === 'CodeMark' && parent?.name !== 'InlineCode') return;
        // A Link's own marks were hidden by the Link case; what reaches here
        // is an autolink's angle brackets.
        if (name === 'LinkMark' && parent?.name === 'Link') return;
        // The hashes of a heading still missing its space stay visible —
        // the line check above left the whole construct undrawn.
        if (
          name === 'HeaderMark' &&
          parent &&
          HEADING.test(parent.name) &&
          state.doc.sliceString(node.to, node.to + 1) !== ' '
        ) {
          return;
        }

        // `## ` — the separating space goes with the hashes, or the heading
        // would render with a leading gap.
        const end =
          name === 'HeaderMark' && state.doc.sliceString(node.to, node.to + 1) === ' '
            ? node.to + 1
            : node.to;
        hide(node.from, end);
      },
    });
  }

  return {
    decorations: Decoration.set(decos, true),
    hidden: Decoration.set(atoms, true),
  };
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

const inlinePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    hidden: DecorationSet;

    constructor(view: EditorView) {
      const built = build(view);
      this.decorations = built.decorations;
      this.hidden = built.hidden;
    }

    update(u: ViewUpdate) {
      // Selection no longer changes what is drawn, but the tree can finish
      // parsing without a doc change, and the viewport moves.
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        const built = build(u.view);
        this.decorations = built.decorations;
        this.hidden = built.hidden;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      // Atomic, so the caret steps over a hidden marker as one unit instead
      // of stranding itself between invisible characters.
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.hidden ?? Decoration.none,
      ),
  },
);

/**
 * Rendered markdown, live. Not registered at all in source mode, so the raw
 * document is exactly what you see.
 *
 * The block constructs come from their own state fields — a block widget
 * can't be produced by a view plugin, and a callout's tint has to be right
 * before its opening line has been scrolled into view — and the inline plugin
 * runs last, over everything they leave as ordinary text.
 */
export const livePreview: Extension = [
  tablePreview,
  galleryPreview,
  colonBlockPreview,
  takeawaysPreview,
  inlinePreview,
  syntaxEdits,
];
