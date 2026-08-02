import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EditorMode } from '@/components/editor/MarkdownEditor';

interface UiState {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  /**
   * Distraction-free writing. Lives here rather than in the editor because
   * the app chrome (top bar, sidebar) is what has to get out of the way; the
   * editor turns it off when it unmounts.
   */
  focusMode: boolean;
  /** Rendered markdown or raw source. A preference, so it persists. */
  editorMode: EditorMode;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  toggleCommand: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setFocusMode: (on: boolean) => void;
  toggleFocusMode: () => void;
  setEditorMode: (mode: EditorMode) => void;
  toggleEditorMode: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandOpen: false,
      shortcutsOpen: false,
      focusMode: false,
      editorMode: 'wysiwyg',
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCommandOpen: (open) => set({ commandOpen: open }),
      toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
      setFocusMode: (on) => set({ focusMode: on }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setEditorMode: (mode) => set({ editorMode: mode }),
      toggleEditorMode: () =>
        set((s) => ({
          editorMode: s.editorMode === 'wysiwyg' ? 'markdown' : 'wysiwyg',
        })),
    }),
    {
      name: 'plym.ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        editorMode: s.editorMode,
      }),
    },
  ),
);
