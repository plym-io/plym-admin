import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowSquareOut, LinkBreak } from '@phosphor-icons/react';

const WIDTH = 280;

interface Props {
  /** Viewport coords of the link's first character. */
  coords: { left: number; top: number; bottom: number };
  url: string;
  /** Focus the URL field straight away — a link that doesn't have one yet. */
  autoFocus: boolean;
  onUrlChange: (url: string) => void;
  onOpen: () => void;
  onUnlink: () => void;
  /** Done editing: commit, and put the caret back in the prose if asked to. */
  onDone: (refocus: boolean) => void;
  /** Written by the popover, read by the caret-watcher: focus is in here. */
  focusWithin: React.RefObject<boolean>;
}

/**
 * The URL of a link, shown beside it — the way a document editor does it.
 * Rich mode never draws the `](url)` half of a link, so this floating field
 * is where the target lives: type or paste it, open it, or take the link off
 * the words entirely.
 */
export function LinkPopover({
  coords,
  url,
  autoFocus,
  onUrlChange,
  onOpen,
  onUnlink,
  onDone,
  focusWithin,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return;
      onDone(false);
    };
    // Deferred a tick: the click that put the caret in the link is still
    // bubbling when this mounts, and it must not count as "outside".
    const arm = setTimeout(() => window.addEventListener('mousedown', down), 0);
    return () => {
      clearTimeout(arm);
      window.removeEventListener('mousedown', down);
    };
  }, [onDone]);

  const left = Math.min(coords.left, window.innerWidth - WIDTH - 8);
  const top = coords.bottom + 6;

  return (
    <motion.div
      ref={box}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'fixed', left, top, width: WIDTH }}
      className="z-[90] flex items-center gap-0.5 rounded-lg border border-border bg-bg p-1 shadow-lg"
      onFocus={() => {
        focusWithin.current = true;
      }}
      onBlur={() => {
        focusWithin.current = false;
      }}
    >
      <input
        type="text"
        value={url}
        autoFocus={autoFocus}
        placeholder="Paste or type a link…"
        spellCheck={false}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone(true);
          }
        }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-fg-subtle"
      />
      <IconButton label="Open link" disabled={!url} onClick={onOpen}>
        <ArrowSquareOut size={15} />
      </IconButton>
      <IconButton label="Remove link" onClick={onUnlink}>
        <LinkBreak size={15} />
      </IconButton>
    </motion.div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      // The caret in the editor is the subject here — don't take focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
