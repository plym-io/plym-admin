import { useEffect } from 'react';

interface ShortcutOptions {
  /** Fire even while focused in an input/textarea/contenteditable. Default false. */
  allowInInput?: boolean;
  enabled?: boolean;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    el.isContentEditable ||
    el.closest('.cm-editor') !== null
  );
}

/**
 * Register a keyboard shortcut. `combo` examples: "mod+k", "mod+enter",
 * "mod+shift+b", "?", "escape". `mod` = ⌘ on macOS, Ctrl elsewhere.
 */
export function useShortcut(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  { allowInInput = false, enabled = true }: ShortcutOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needMod = parts.includes('mod');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt');

    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (needMod !== mod) return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      const pressed = e.key.toLowerCase();
      const match = key === 'enter' ? pressed === 'enter' : pressed === key;
      if (!match) return;
      if (!allowInInput && isEditable(e.target)) return;
      e.preventDefault();
      handler(e);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler, allowInInput, enabled]);
}
