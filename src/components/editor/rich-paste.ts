import { Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { htmlToMarkdown, isWorthConverting } from './html-to-markdown';

/**
 * CodeMirror's own paste handler reads `text/plain` and nothing else, so the
 * rich flavour Google Docs and Word put on the clipboard alongside it is
 * discarded and a formatted document arrives as unmarked prose. This handler
 * takes the `text/html` flavour instead and converts it to markdown.
 *
 * It registers above the built-in one and returns `true` to claim the event.
 * Every path that can't do better than the plain text returns `false` and
 * lets CodeMirror paste exactly as it always has.
 */

export interface RichPasteHandlers {
  /** Images whose source can't be carried into a post. Never silent. */
  onDroppedImages?: (count: number) => void;
}

const CODE_NODE = /^(FencedCode|CodeBlock|CodeText|InlineCode)$/;

/** In a fence, the pasted characters are the content — converting is wrong. */
function inCode(view: EditorView, pos: number): boolean {
  for (
    let node = syntaxTree(view.state).resolveInner(pos, -1) as { name: string; parent: unknown } | null;
    node;
    node = node.parent as { name: string; parent: unknown } | null
  ) {
    if (CODE_NODE.test(node.name)) return true;
  }
  return false;
}

export function richPaste(handlers: RichPasteHandlers = {}) {
  return Prec.high(
    EditorView.domEventHandlers({
      paste: (event, view) => {
        const data = event.clipboardData;
        if (!data || view.state.readOnly) return false;

        const html = data.getData('text/html');
        if (!html.trim()) return false;
        if (inCode(view, view.state.selection.main.from)) return false;

        let converted;
        try {
          converted = htmlToMarkdown(html);
        } catch {
          return false;
        }

        // Said before the decision to claim, not after: a paste of nothing but
        // an image converts to nothing, falls through to the plain flavour,
        // and would otherwise lose the image without a word.
        if (converted.droppedImages > 0) {
          handlers.onDroppedImages?.(converted.droppedImages);
        }

        if (!isWorthConverting(converted.markdown, data.getData('text/plain'))) {
          return false;
        }

        view.dispatch({
          ...view.state.replaceSelection(converted.markdown),
          scrollIntoView: true,
          userEvent: 'input.paste',
        });
        return true;
      },
    }),
  );
}
