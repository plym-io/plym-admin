import { useNavigate } from 'react-router';
import { useShortcut } from './use-shortcut';
import { useUiStore } from '@/store/ui';

/**
 * App-wide shortcuts that work from any page (BRD §4):
 *  ⌘K  command palette (even mid-typing)
 *  ⌘N  new post
 *  ⌘B  toggle sidebar
 *  ?   shortcut help
 * Page-local shortcuts (⌘S, ⌘Enter, ⌘/) live in the editor.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const toggleCommand = useUiStore((s) => s.toggleCommand);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setShortcuts = useUiStore((s) => s.setShortcutsOpen);

  useShortcut('mod+k', () => toggleCommand(), { allowInInput: true });
  useShortcut('mod+n', () => navigate('/posts/new'), { allowInInput: true });
  useShortcut('mod+b', () => toggleSidebar());
  useShortcut('?', () => setShortcuts(true));
}
