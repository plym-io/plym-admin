import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import CodeMirror, {
  EditorView,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView as CMView } from '@codemirror/view';
import { uploadMedia } from '@/lib/upload';
import { useMediaStore } from '@/store/media';
import type { MediaItem } from '@/types';
import { SlashMenu } from './SlashMenu';
import { MediaPicker } from './MediaPicker';
import { filterCommands, type SlashContext } from './slash-commands';

interface Props {
  value: string;
  onChange: (value: string) => void;
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
  onScroll?: (fraction: number) => void;
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
export function MarkdownEditor({ value, onChange, editorRef, onScroll }: Props) {
  const prepend = useMediaStore((s) => s.prepend);
  const internalRef = useRef<ReactCodeMirrorRef | null>(null);
  const pendingPos = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      } catch {
        replaceInDoc(placeholder, '![upload failed]()');
      }
    },
    [getView, prepend, replaceInDoc],
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
  const theme = useMemo(
    () =>
      CMView.theme({
        '&': { fontSize: '15px', backgroundColor: 'transparent', height: '100%' },
        '.cm-content': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.7',
          padding: '8px 4px 40vh',
          caretColor: 'var(--color-accent)',
        },
        '.cm-cursor': { borderLeftColor: 'var(--color-accent)' },
        '&.cm-focused': { outline: 'none' },
        '.cm-line': { padding: '0' },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: 'var(--color-accent-soft) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--color-accent-soft) !important',
        },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
      }),
    [],
  );

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
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
    ],
    [detectSlash, onScroll],
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

  return (
    <div
      className="relative h-full overflow-hidden"
      onKeyDownCapture={onKeyDownCapture}
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

      {menuVisible && slash && (
        <SlashMenu
          commands={filtered}
          activeIndex={safeIndex}
          coords={slash.coords}
          onSelect={(cmd) => runCommand(filtered.indexOf(cmd))}
          onHover={setActiveIndex}
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
