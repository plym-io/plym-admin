import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';

/**
 * plym's `:::` blocks, drawn in the editor.
 *
 * The grammar belongs to the renderer (`plym/render/colon_blocks.py`): nine
 * admonition names plus `tabs`/`tab`, opened by `:::name optional title`,
 * closed by a bare `:::`, nested by depth and inert inside a code fence. This
 * mirrors it rather than approximating it, because a box drawn here around
 * something the API will reject is worse than no box at all — so anything this
 * can't be sure of, it leaves as plain text.
 *
 * What it draws is a tint and a title, not a replacement: the body stays real
 * markdown on real lines, live-previewed by the same plugin as the rest of the
 * document. The `:::` markers themselves are never drawn — syntax-edits keeps
 * typing and deletion from landing inside them.
 */

export const ADMONITIONS = [
  'note',
  'attention',
  'caution',
  'danger',
  'error',
  'tip',
  'hint',
  'warning',
  'important',
] as const;

export type Admonition = (typeof ADMONITIONS)[number];

export const TABS = 'tabs';
export const TAB = 'tab';

const NAMES = new Set<string>([...ADMONITIONS, TABS, TAB]);

/** `   :::note   A title` — indent, name, and whatever is left as the title. */
const OPEN = /^( {0,3}:::[ ]*)([A-Za-z][\w-]*)([ ]*)(.*?)[ ]*$/;
const CLOSE = /^ {0,3}:::[ ]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export type BlockKind = 'admonition' | 'tabs' | 'tab';

export interface ColonBlock {
  name: string;
  /** The words after the name, empty when the opener carried none. */
  title: string;
  kind: BlockKind;
  /** 0-based line indexes of the `:::name` and of the `:::` that closes it. */
  open: number;
  close: number;
  /** Where the title starts on the opening line — everything before it is syntax. */
  titleAt: number;
  /** How many blocks — named or not — enclose this one. */
  depth: number;
}

function kindOf(name: string): BlockKind {
  if (name === TABS) return 'tabs';
  if (name === TAB) return 'tab';
  return 'admonition';
}

interface Opener {
  name: string;
  title: string;
  titleAt: number;
  line: number;
}

/**
 * Every closed `:::` block in the document.
 *
 * An opener with a name the renderer doesn't know still nests — the renderer
 * counts colon fences, not names, when it looks for the close — it just never
 * becomes a block of its own. An unclosed one becomes nothing: that document
 * doesn't save, so there is nothing to preview.
 */
export function parseColonBlocks(lines: string[]): ColonBlock[] {
  const blocks: ColonBlock[] = [];
  const stack: Opener[] = [];
  let fence: string | null = null;

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    const marker = FENCE.exec(text)?.[1];

    if (fence !== null) {
      // Only the same character, at least as long and alone on its line.
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && text.trim() === marker) {
        fence = null;
      }
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }

    if (CLOSE.test(text)) {
      const opener = stack.pop();
      if (!opener || !NAMES.has(opener.name)) continue;
      // A tab pane only exists inside a set; on its own the renderer rejects
      // the post, so drawing it as one would be a promise this can't keep.
      const parent = stack[stack.length - 1];
      if (opener.name === TAB && parent?.name !== TABS) continue;
      blocks.push({
        name: opener.name,
        title: opener.title,
        kind: kindOf(opener.name),
        open: opener.line,
        close: index,
        titleAt: opener.titleAt,
        depth: stack.length,
      });
      continue;
    }

    const m = OPEN.exec(text);
    if (m) {
      stack.push({
        name: m[2].toLowerCase(),
        title: m[4],
        titleAt: m[1].length + m[2].length + m[3].length,
        line: index,
      });
    }
  }

  return blocks;
}

/** `note` → `Note`, which is the title the renderer falls back to as well. */
export function defaultTitle(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The label a block's opening line reads as once its `:::` is hidden. */
class TitleWidget extends WidgetType {
  constructor(
    readonly className: string,
    readonly text: string,
  ) {
    super();
  }

  eq(other: TitleWidget) {
    return other.className === this.className && other.text === this.text;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }

  /** Clicks land in the source, the way an image's do. */
  ignoreEvent() {
    return false;
  }
}

const hidden = Decoration.replace({});

function lineClasses(block: ColonBlock): string {
  if (block.kind === 'admonition') return `cm-md-cb cm-md-cb-adm cm-md-cb-${block.name}`;
  return block.kind === 'tabs' ? 'cm-md-cb cm-md-cb-tabs' : 'cm-md-cb cm-md-cb-tab';
}

function titleClass(block: ColonBlock): string {
  return block.kind === 'tab' ? 'cm-md-cb-tablabel' : 'cm-md-cb-title';
}

interface Built {
  decorations: DecorationSet;
  hidden: DecorationSet;
}

const NONE: Built = { decorations: Decoration.none, hidden: Decoration.none };

function build(state: EditorState): Built {
  const blocks = parseColonBlocks(state.doc.toString().split('\n'));
  if (blocks.length === 0) return NONE;

  // A line takes its colour from the innermost block holding it, so a tip
  // inside a note reads as a tip rather than as two overlapping tints.
  const owner = new Map<number, ColonBlock>();
  const opens = new Set<number>();
  const closes = new Set<number>();
  for (const block of blocks) {
    opens.add(block.open);
    closes.add(block.close);
    for (let i = block.open; i <= block.close; i++) {
      const held = owner.get(i);
      if (!held || block.depth > held.depth) owner.set(i, block);
    }
  }

  const decos: Range<Decoration>[] = [];
  const atoms: Range<Decoration>[] = [];
  /** Closing lines whose `:::` is hidden, and which therefore need no height. */
  const collapsed = new Set<number>();

  const replace = (from: number, to: number, deco: Decoration) => {
    const r = deco.range(from, to);
    decos.push(r);
    atoms.push(r);
  };

  for (const block of blocks) {
    const open = state.doc.line(block.open + 1);
    // With a title, only the `:::name ` in front of it goes — the title is
    // ordinary text and stays editable. Without one, the whole marker is
    // replaced by the name the renderer would have printed.
    if (block.title) {
      replace(open.from, open.from + block.titleAt, hidden);
    } else {
      replace(
        open.from,
        open.to,
        Decoration.replace({
          widget: new TitleWidget(titleClass(block), defaultTitle(block.name)),
        }),
      );
    }

    const close = state.doc.line(block.close + 1);
    if (close.to > close.from) {
      replace(close.from, close.to, hidden);
      collapsed.add(block.close);
    }
  }

  for (const [index, block] of owner) {
    const classes = [lineClasses(block)];
    if (opens.has(index)) classes.push('cm-md-cb-open');
    if (closes.has(index)) classes.push('cm-md-cb-close');
    // Emptied of its marker, a closing line only has to hold the block's
    // bottom padding; left at prose height it reads as a blank paragraph.
    if (collapsed.has(index)) classes.push('cm-md-cb-collapsed');
    decos.push(
      Decoration.line({ class: classes.join(' ') }).range(state.doc.line(index + 1).from),
    );
  }

  return {
    decorations: Decoration.set(decos, true),
    hidden: Decoration.set(atoms, true),
  };
}

/**
 * Line decorations can come from a view plugin, but these are derived from the
 * whole document rather than the viewport — a block's tint has to be right
 * before its opener has been scrolled into view — so they get a field.
 */
export const colonBlockPreview: Extension = StateField.define<Built>({
  create: build,
  update: (built, tr) => (tr.docChanged ? build(tr.state) : built),
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(f).hidden),
  ],
});
