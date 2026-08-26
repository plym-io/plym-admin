import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { richPaste, type RichPasteHandlers } from './rich-paste';

/**
 * Drives the real extension through a real paste event, because the bug being
 * fixed was never in the conversion — it was that CodeMirror's own handler
 * reads `text/plain` and the HTML flavour never gets looked at.
 */
function editor(doc: string, handlers: RichPasteHandlers = {}): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), richPaste(handlers)],
    }),
    parent: document.body,
  });
}

/**
 * Returns the document afterwards. `defaultPrevented` says nothing useful —
 * CodeMirror's built-in handler claims the event too when ours declines — so
 * what landed in the document is the only honest signal.
 */
function paste(view: EditorView, flavours: Record<string, string>): string {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => flavours[type] ?? '' },
  });
  view.contentDOM.dispatchEvent(event);
  return view.state.doc.toString();
}

const DOCS_HTML =
  '<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-x">' +
  '<h2><span style="font-weight:400">A heading</span></h2>' +
  '<p><span>and </span><span style="font-weight:700">bold</span><span> text</span></p>' +
  '</b>';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('richPaste', () => {
  it('converts the HTML flavour instead of dropping it for the plain one', () => {
    const view = editor('');
    expect(
      paste(view, {
        'text/html': DOCS_HTML,
        'text/plain': 'A heading\nand bold text',
      }),
    ).toBe('## A heading\n\nand **bold** text');
  });

  it('replaces the selection rather than appending', () => {
    const view = editor('keep REPLACE keep');
    view.dispatch({ selection: { anchor: 5, head: 12 } });
    expect(
      paste(view, { 'text/html': '<p><b>new</b></p>', 'text/plain': 'new' }),
    ).toBe('keep **new** keep');
  });

  it('leaves a paste that gains nothing to CodeMirror', () => {
    const view = editor('');
    expect(
      paste(view, {
        'text/html': '<meta charset="utf-8"><span>just some words</span>',
        'text/plain': 'just some words',
      }),
    ).toBe('just some words');
  });

  it('leaves a paste with no HTML flavour alone', () => {
    const view = editor('');
    expect(paste(view, { 'text/plain': 'nothing but text' })).toBe('nothing but text');
  });

  it('does not convert inside a fenced code block', () => {
    const view = editor('```html\n\n```');
    view.dispatch({ selection: { anchor: 8 } }); // the empty line inside the fence
    const after = paste(view, {
      'text/html': DOCS_HTML,
      'text/plain': '<h2>A heading</h2>',
    });

    expect(after).toBe('```html\n<h2>A heading</h2>\n```');
  });

  it('says so when an image could not come across', () => {
    const onDroppedImages = vi.fn();
    const view = editor('', { onDroppedImages });
    paste(view, {
      'text/html': '<h2>Title</h2><p><img src="data:image/png;base64,AAAA"></p>',
      'text/plain': 'Title',
    });

    expect(onDroppedImages).toHaveBeenCalledWith(1);
  });

  it('says so even when the image was the only thing pasted', () => {
    const onDroppedImages = vi.fn();
    const view = editor('', { onDroppedImages });
    // Converts to nothing, so the plain flavour wins — but the author still
    // needs to know an image was on the clipboard and isn't in the post.
    paste(view, {
      'text/html': '<img src="file:///C:/Temp/clip_image001.png">',
      'text/plain': '',
    });

    expect(onDroppedImages).toHaveBeenCalledWith(1);
  });

  it('stays quiet when every image came across', () => {
    const onDroppedImages = vi.fn();
    const view = editor('', { onDroppedImages });
    paste(view, {
      'text/html': '<h2>Title</h2><p><img src="https://plym.io/a.png" alt="a"></p>',
      'text/plain': 'Title',
    });

    expect(onDroppedImages).not.toHaveBeenCalled();
  });
});
