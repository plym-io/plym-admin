import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView as CMView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { toast } from 'sonner';
import { uploadMedia } from '@/lib/upload';
import { isApiError } from '@/api/errors';
import { useMediaStore } from '@/store/media';
import type { MediaItem } from '@/types';
import { livePreview, proseHighlight } from './live-preview';
import { SlashMenu } from './SlashMenu';
import { MediaPicker } from './MediaPicker';
import { filterCommands, type SlashContext } from './slash-commands';
import { FormatToolbar, type EditorActions } from './FormatToolbar';
import { SelectionMenu } from './SelectionMenu';
import { BOLD, ITALIC, insertLink, run, toggleInline } from './format-commands';
import { insertTable } from './table-widget';

export type EditorMode = 'wysiwyg' | 'markdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
  onScroll?: (fraction: number) => void;
  /**
   * `wysiwyg` renders the markdown in place (see live-preview); `markdown`
   * shows the raw source. Same document either way — only the rendering
   * differs — so switching is free and lossless.
   */
  mode?: EditorMode;
}

interface SlashState {
  from: number;
  to: number;
  query: string;
  coords: { left: number; top: number; bottom: number };
}

/**
 * A "piece of paper" markdown editor — no gutter, no line numbers, accent
 * selection. Supports drag/drop image upload and a Notion-style "/" command
 * menu (headings, table, code, lists, media, image upload, …).
 */
export function MarkdownEditor({
  value,
  onChange,
  editorRef,
  onScroll,
  mode = 'wysiwyg',
}: Props) {
  const prepend = useMediaStore((s) => s.prepend);
  const internalRef = useRef<ReactCodeMirrorRef | null>(null);
  const pendingPos = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(
    null,
  );

  const getView = useCallback(
    () => internalRef.current?.view ?? editorRef?.current?.view ?? null,
    [editorRef],
  );

  const setRefs = useCallback(
    (r: ReactCodeMirrorRef | null) => {
      internalRef.current = r;
      if (editorRef) editorRef.current = r;
    },
    [editorRef],
  );

  // ---- slash detection ----------------------------------------------
  const detectSlash = useCallback((view: EditorView) => {
    if (!view.hasFocus) {
      setSlash(null);
      return;
    }
    const sel = view.state.selection.main;
    if (!sel.empty) {
      setSlash(null);
      return;
    }
    const pos = sel.head;
    const line = view.state.doc.lineAt(pos);
    const before = view.state.sliceDoc(line.from, pos);
    // "/" at line start or after whitespace, followed by word chars only.
    const m = before.match(/(?:^|\s)\/([\w-]*)$/);
    if (!m) {
      setSlash(null);
      return;
    }
    const query = m[1];
    const from = pos - query.length - 1;
    const coords = view.coordsAtPos(from);
    if (!coords) {
      setSlash(null);
      return;
    }
    setSlash({
      from,
      to: pos,
      query,
      coords: { left: coords.left, top: coords.top, bottom: coords.bottom },
    });
  }, []);

  const filtered = useMemo(
    () => (slash ? filterCommands(slash.query) : []),
    [slash],
  );
  const menuVisible = slash !== null && filtered.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  // Reset the highlight whenever the query changes.
  useEffect(() => setActiveIndex(0), [slash?.query]);

  // ---- doc helpers ---------------------------------------------------
  const insertAtCursor = useCallback(
    (text: string) => {
      const view = getView();
      if (!view) {
        onChange(value + text);
        return;
      }
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
    },
    [getView, onChange, value],
  );

  const replaceInDoc = useCallback(
    (find: string, replace: string) => {
      const view = getView();
      if (!view) return;
      const idx = view.state.doc.toString().indexOf(find);
      if (idx === -1) return;
      view.dispatch({
        changes: { from: idx, to: idx + find.length, insert: replace },
      });
    },
    [getView],
  );

  const insertImageAt = useCallback(
    (pos: number, item: MediaItem) => {
      const view = getView();
      if (!view) return;
      const md = `![${item.original_name ?? 'image'}](${item.url})`;
      view.dispatch({
        changes: { from: pos, insert: md },
        selection: { anchor: pos + md.length },
      });
      view.focus();
    },
    [getView],
  );

  const uploadAndInsertAt = useCallback(
    async (pos: number, file: File) => {
      const view = getView();
      if (!view) return;
      const token = Math.random().toString(36).slice(2, 8);
      const placeholder = `![uploading ${file.name}… ${token}]()`;
      view.dispatch({
        changes: { from: pos, insert: placeholder + '\n' },
        selection: { anchor: pos + placeholder.length + 1 },
      });
      try {
        const item = await uploadMedia(file);
        prepend(item);
        replaceInDoc(placeholder, `![${item.original_name ?? 'image'}](${item.url})`);
      } catch (e) {
        replaceInDoc(placeholder, '![upload failed]()');
        toast.error(isApiError(e) ? e.message : 'Upload failed');
      }
    },
    [getView, prepend, replaceInDoc],
  );

  // ---- toolbar / context-menu actions --------------------------------
  const actions: EditorActions = useMemo(
    () => ({
      inline: (mark) => {
        const view = getView();
        if (view) run(view, toggleInline(view.state, mark));
      },
      link: () => {
        const view = getView();
        if (view) run(view, insertLink(view.state));
      },
      upload: () => {
        const view = getView();
        pendingPos.current = view?.state.selection.main.head ?? 0;
        fileInput.current?.click();
      },
      table: () => {
        const view = getView();
        if (!view) return;
        const { from, to } = view.state.selection.main;
        insertTable(view, from, to);
      },
    }),
    [getView],
  );

  // ---- run a slash command ------------------------------------------
  const runCommand = useCallback(
    (index: number) => {
      const view = getView();
      if (!view || !slash) return;
      const cmd = filtered[index];
      if (!cmd) return;
      const { from, to } = slash;
      const ctx: SlashContext = {
        view,
        from,
        to,
        openMedia: () => {
          // Drop the "/query" first, then remember where the image goes.
          view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
          pendingPos.current = from;
          setPickerOpen(true);
        },
        openImageUpload: () => {
          view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
          pendingPos.current = from;
          fileInput.current?.click();
        },
      };
      setSlash(null);
      cmd.run(ctx);
    },
    [getView, slash, filtered],
  );

  // ---- keyboard while the menu is open ------------------------------
  const onKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (!menuVisible) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setActiveIndex((i) => (i + 1) % filtered.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          runCommand(safeIndex);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setSlash(null);
          break;
      }
    },
    [menuVisible, filtered.length, safeIndex, runCommand],
  );

  // ---- theme + extensions -------------------------------------------
  // Two faces, no more: Merriweather for prose, and the mono (Google Sans
  // Code) for code and for the whole surface in markdown mode, where the
  // characters you're aligning are the point.
  const source = mode === 'markdown';
  const theme = useMemo(
    () =>
      CMView.theme({
        '&': {
          fontSize: source ? '15px' : '17px',
          backgroundColor: 'transparent',
          height: '100%',
        },
        '.cm-content': {
          fontFamily: source ? 'var(--font-mono)' : 'var(--font-editor)',
          lineHeight: source ? '1.6' : '1.75',
          padding: '8px 4px 40vh',
          caretColor: 'var(--color-accent)',
        },
        '.cm-cursor': { borderLeftColor: 'var(--color-accent)', borderLeftWidth: '2px' },
        '&.cm-focused': { outline: 'none' },
        '.cm-line': { padding: '0' },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: 'var(--color-accent-soft) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--color-accent-soft) !important',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: source ? 'var(--font-mono)' : 'var(--font-editor)',
        },

        // ---- live preview (WYSIWYG mode) ----
        '.cm-md-h1': {
          fontSize: '1.9em',
          fontWeight: '700',
          lineHeight: '1.25',
          letterSpacing: '-0.02em',
          padding: '0.7em 0 0.15em',
        },
        '.cm-md-h2': {
          fontSize: '1.5em',
          fontWeight: '700',
          lineHeight: '1.3',
          letterSpacing: '-0.015em',
          padding: '0.6em 0 0.12em',
        },
        '.cm-md-h3': {
          fontSize: '1.25em',
          fontWeight: '600',
          lineHeight: '1.35',
          padding: '0.55em 0 0.1em',
        },
        '.cm-md-h4, .cm-md-h5, .cm-md-h6': {
          fontSize: '1.08em',
          fontWeight: '600',
          padding: '0.5em 0 0.1em',
        },
        '.cm-md-em': { fontStyle: 'italic' },
        '.cm-md-strong': { fontWeight: '700' },
        '.cm-md-strike': {
          textDecoration: 'line-through',
          color: 'var(--color-fg-subtle)',
        },
        '.cm-md-code': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85em',
          backgroundColor: 'var(--color-bg-muted)',
          borderRadius: '4px',
          padding: '0.15em 0.35em',
        },
        '.cm-md-link': {
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          textDecorationColor: 'var(--color-border-strong)',
        },
        '.cm-md-url': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82em',
          color: 'var(--color-fg-subtle)',
        },
        '.cm-md-list-mark': { color: 'var(--color-fg-muted)' },
        '.cm-md-bullet': { color: 'var(--color-fg-muted)' },
        '.cm-md-quote': {
          borderLeft: '3px solid var(--color-border-strong)',
          paddingLeft: '0.9em',
          fontStyle: 'italic',
          color: 'var(--color-fg-muted)',
        },
        '.cm-md-codeblock': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85em',
          lineHeight: '1.6',
          backgroundColor: 'var(--color-bg-muted)',
        },
        '.cm-md-table': {
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85em',
        },
        '.cm-md-hr': {
          color: 'var(--color-fg-subtle)',
          borderBottom: '1px solid var(--color-border-strong)',
        },
        '.cm-md-image img': {
          display: 'block',
          maxWidth: '100%',
          borderRadius: 'var(--radius-lg, 8px)',
          margin: '0.4em 0',
        },

        // ---- plym's ::: blocks ----
        // Drawn as a tinted band down the left, one line decoration per line,
        // so the body inside stays ordinary editable markdown.
        '.cm-md-cb': {
          backgroundColor: 'var(--color-bg-subtle)',
          borderLeft: '3px solid var(--color-border-strong)',
          paddingLeft: '0.9em',
          paddingRight: '0.6em',
        },
        '.cm-md-cb-open': {
          paddingTop: '0.35em',
          fontWeight: '600',
        },
        '.cm-md-cb-collapsed': {
          fontSize: '0.35em',
        },
        '.cm-md-cb-note, .cm-md-cb-important': {
          borderLeftColor: 'var(--color-accent)',
        },
        '.cm-md-cb-warning, .cm-md-cb-caution, .cm-md-cb-attention': {
          borderLeftColor: 'var(--color-warning)',
        },
        '.cm-md-cb-danger, .cm-md-cb-error': {
          borderLeftColor: 'var(--color-danger)',
        },
        '.cm-md-cb-tip, .cm-md-cb-hint': {
          borderLeftColor: 'var(--color-success)',
        },
        '.cm-md-cb-note.cm-md-cb-open, .cm-md-cb-important.cm-md-cb-open': {
          color: 'var(--color-accent)',
        },
        '.cm-md-cb-warning.cm-md-cb-open, .cm-md-cb-caution.cm-md-cb-open, .cm-md-cb-attention.cm-md-cb-open':
          { color: 'var(--color-warning)' },
        '.cm-md-cb-danger.cm-md-cb-open, .cm-md-cb-error.cm-md-cb-open': {
          color: 'var(--color-danger)',
        },
        '.cm-md-cb-tip.cm-md-cb-open, .cm-md-cb-hint.cm-md-cb-open': {
          color: 'var(--color-success)',
        },
        // A tab set is the container; each pane's label is the bar that opens
        // it. Real tabs hide the panes you aren't reading — which is exactly
        // what you can't do to text someone is editing.
        '.cm-md-cb-tabs': {
          borderLeftColor: 'var(--color-border-strong)',
          backgroundColor: 'var(--color-bg-muted)',
        },
        '.cm-md-cb-tab': {
          backgroundColor: 'var(--color-bg-subtle)',
          borderLeftColor: 'var(--color-accent)',
        },
        '.cm-md-cb-tab.cm-md-cb-open': {
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8em',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: 'var(--color-fg-muted)',
        },
        '.cm-md-cb-title, .cm-md-cb-tablabel': {
          color: 'inherit',
        },
      }),
    [source],
  );

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      // Registered in both modes — basicSetup's default style is a `fallback`,
      // so this simply takes precedence over it.
      proseHighlight,
      ...(mode === 'wysiwyg' ? [livePreview] : []),
      CMView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet || u.focusChanged || u.geometryChanged) {
          detectSlash(u.view);
        }
      }),
      CMView.domEventHandlers({
        scroll: (_e, view) => {
          // Slash menu is anchored to the caret — close it on scroll.
          setSlash(null);
          if (!onScroll) return false;
          const el = view.scrollDOM;
          const max = el.scrollHeight - el.clientHeight;
          onScroll(max > 0 ? el.scrollTop / max : 0);
          return false;
        },
      }),
      // CodeMirror's basicSetup binds Mod-Enter (insertBlankLine) and Mod-/
      // (toggleComment), which otherwise hijack the app's publish/preview
      // shortcuts and mutate the document. Mark them handled with no-ops —
      // no stopPropagation, so the keydown still bubbles to the window-level
      // useShortcut listeners in posts.editor.tsx.
      Prec.highest(
        keymap.of([
          { key: 'Mod-Enter', run: () => true },
          { key: 'Mod-/', run: () => true },
          // The window-level shortcuts ignore keys pressed inside .cm-editor,
          // so ⌘B is ours here and still toggles the sidebar everywhere else.
          {
            key: 'Mod-b',
            run: (v) => {
              run(v, toggleInline(v.state, BOLD));
              return true;
            },
          },
          {
            key: 'Mod-i',
            run: (v) => {
              run(v, toggleInline(v.state, ITALIC));
              return true;
            },
          },
        ]),
      ),
    ],
    [detectSlash, onScroll, mode],
  );

  // ---- drag & drop ---------------------------------------------------
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      const payload = e.dataTransfer.getData('application/x-plym-media');
      if (payload) {
        e.preventDefault();
        try {
          const m = JSON.parse(payload) as { url: string; alt: string };
          insertAtCursor(`![${m.alt}](${m.url})`);
        } catch {
          /* ignore */
        }
        return;
      }

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      e.preventDefault();
      const view = getView();
      let pos = view?.state.selection.main.head ?? 0;
      for (const file of files) {
        await uploadAndInsertAt(pos, file);
        pos += 1; // best-effort advance; exact position not critical
      }
    },
    [insertAtCursor, uploadAndInsertAt, getView],
  );

  /** Right-click over a selection gets our menu; anything else stays native. */
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const view = getView();
      if (!view || view.state.selection.main.empty) return;
      if (!(e.target instanceof Node) || !view.contentDOM.contains(e.target)) {
        return;
      }
      e.preventDefault();
      setContextAt({ x: e.clientX, y: e.clientY });
    },
    [getView],
  );

  return (
    <div
      className="flex h-full flex-col"
      onKeyDownCapture={onKeyDownCapture}
      onContextMenu={onContextMenu}
      onDrop={handleDrop}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes('Files') ||
          e.dataTransfer.types.includes('application/x-plym-media')
        ) {
          e.preventDefault();
        }
      }}
    >
      <FormatToolbar actions={actions} />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const pos = pendingPos.current;
          if (file && pos != null) void uploadAndInsertAt(pos, file);
          pendingPos.current = null;
          e.target.value = '';
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          ref={setRefs}
          value={value}
          onChange={onChange}
          height="100%"
          theme={theme}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            drawSelection: true,
          }}
          extensions={extensions}
          className="h-full"
        />
      </div>

      {menuVisible && slash && (
        <SlashMenu
          commands={filtered}
          activeIndex={safeIndex}
          coords={slash.coords}
          onSelect={(cmd) => runCommand(filtered.indexOf(cmd))}
          onHover={setActiveIndex}
        />
      )}

      {contextAt && (
        <SelectionMenu
          x={contextAt.x}
          y={contextAt.y}
          actions={actions}
          onClose={() => setContextAt(null)}
        />
      )}

      <MediaPicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          pendingPos.current = null;
        }}
        onPick={(item) => {
          const pos = pendingPos.current;
          if (pos != null) insertImageAt(pos, item);
          pendingPos.current = null;
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
