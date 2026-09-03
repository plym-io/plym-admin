import { syntaxTree } from '@codemirror/language';
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
 * ```` ```gallery ```` — plym's image strip, drawn as one.
 *
 * It is a fenced block rather than a `:::` one (see the `custom_fences` config
 * in `plym/render/markdown_renderer.py`), and its body is nothing but image
 * lines, so unlike a callout there is no prose to keep editable in place. That
 * makes it a replacement, like a table: the strip is the fence's only face in
 * rich mode, and clicking it selects the whole block for deletion.
 */

export const GALLERY = 'gallery';

/** The renderer's own image pattern, and its own fallback: a bare line is a URL. */
const IMAGE = /!\[(.*?)\]\((\S+?)(?:\s+"[^"]*")?\)/;

export interface GalleryImage {
  alt: string;
  src: string;
}

export function parseGallery(source: string): GalleryImage[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = IMAGE.exec(line);
      return m ? { alt: m[1], src: m[2] } : { alt: '', src: line };
    });
}

class GalleryWidget extends WidgetType {
  constructor(readonly images: GalleryImage[]) {
    super();
  }

  eq(other: GalleryWidget) {
    return (
      other.images.length === this.images.length &&
      other.images.every((img, i) => img.src === this.images[i].src && img.alt === this.images[i].alt)
    );
  }

  toDOM(view: EditorView) {
    const strip = document.createElement('div');
    strip.className = 'cm-md-gallery';
    // The source never shows, so a click selects the strip as an object —
    // highlighted, and one Backspace away from gone.
    strip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(strip);
      const resolved = syntaxTree(view.state).resolveInner(pos, 1);
      let node: typeof resolved | null = resolved;
      while (node && node.name !== 'FencedCode') node = node.parent;
      if (node) {
        view.dispatch({ selection: { anchor: node.from, head: node.to } });
        view.focus();
      }
    });
    for (const image of this.images) {
      const img = document.createElement('img');
      img.src = image.src;
      img.alt = image.alt;
      // Same reason as a lone image: the row's height isn't known until the
      // pictures land, and the caret sits off-target until it is.
      img.addEventListener('load', () => view.requestMeasure());
      strip.appendChild(img);
    }
    return strip;
  }

  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return 132;
  }
}

const OPEN_FENCE = /^(?:`{3,}|~{3,})[ ]*gallery$/;
const CLOSE_FENCE = /^(?:`{3,}|~{3,})$/;

/**
 * The lines between the fences. Read off the text rather than the tree so an
 * unterminated fence — one still being typed — still gives up what it has.
 */
function bodyOf(state: EditorState, from: number, to: number): string {
  const lines = state.doc.sliceString(from, to).split('\n');
  const last = lines.length - 1;
  return lines.slice(1, CLOSE_FENCE.test(lines[last].trim()) ? last : undefined).join('\n');
}

/** True when this fence is drawn as a strip, so live-preview leaves it alone. */
export function galleryIsRendered(state: EditorState, from: number, to: number): boolean {
  if (!OPEN_FENCE.test(state.doc.lineAt(from).text.trim())) return false;
  return parseGallery(bodyOf(state, from, to)).length > 0;
}

/** Block nodes a fence can nest inside — everything else is skipped whole. */
const CONTAINERS = new Set([
  'Document',
  'Blockquote',
  'BulletList',
  'OrderedList',
  'ListItem',
]);

function build(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return CONTAINERS.has(node.name) ? undefined : false;
      if (!galleryIsRendered(state, node.from, node.to)) return false;
      decos.push(
        Decoration.replace({
          widget: new GalleryWidget(parseGallery(bodyOf(state, node.from, node.to))),
          block: true,
        }).range(node.from, node.to),
      );
      return false;
    },
  });
  return Decoration.set(decos, true);
}

/** A block widget has to come from a state field, so this ships its own. */
export const galleryPreview: Extension = StateField.define<DecorationSet>({
  create: build,
  update: (decos, tr) =>
    tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? build(tr.state)
      : decos,
  provide: (f) => EditorView.decorations.from(f),
});
