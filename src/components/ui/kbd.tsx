import { cn } from '@/lib/classnames';

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Render a shortcut hint. Pass "mod+k" → ⌘K on macOS, Ctrl+K elsewhere. */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  const parts = keys.split('+').map((k) => {
    const key = k.toLowerCase();
    if (key === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (key === 'shift') return '⇧';
    if (key === 'enter') return '↵';
    if (key === 'alt') return isMac ? '⌥' : 'Alt';
    return k.length === 1 ? k.toUpperCase() : k;
  });
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 rounded border border-border bg-bg px-1.5 py-0.5',
        'font-mono text-[11px] leading-none text-fg-subtle',
        className,
      )}
    >
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </kbd>
  );
}
