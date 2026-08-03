import { useNavigate } from 'react-router';
import { useShortcut } from './use-shortcut';
import { useUiStore } from '@/store/ui';

/**
 * App-wide shortcuts that work from any page (BRD §4):
 *  ⌘K  command palette (even mid-typing)
 *  ⌘I  new post
 *  ⌘B  toggle sidebar
 *  ?   shortcut help
 * Page-local shortcuts (⌘S, ⌘Enter, ⌘/) live in the editor.
 *
 * ⌘N is the browser's own "new window" and never reaches us, which is why
 * new-post is ⌘I. Unlike ⌘K it is deliberately *not* `allowInInput`: ⌘I is
 * italic inside the editor, and `useShortcut` already treats the writing
 * surface as an input, so the two can share the chord without colliding.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const toggleCommand = useUiStore((s) => s.toggleCommand);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setShortcuts = useUiStore((s) => s.setShortcutsOpen);

  useShortcut('mod+k', () => toggleCommand(), { allowInInput: true });
  useShortcut('mod+i', () => navigate('/posts/new'));
  useShortcut('mod+b', () => toggleSidebar());
  useShortcut('?', () => setShortcuts(true));
}
