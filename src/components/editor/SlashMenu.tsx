import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { SlashCommand } from './slash-commands';
import { cn } from '@/lib/classnames';

interface Props {
  commands: SlashCommand[];
  activeIndex: number;
  /** Viewport coords of the caret (left, and top/bottom of the line). */
  coords: { left: number; top: number; bottom: number };
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

const MENU_WIDTH = 256;
const MENU_MAX_HEIGHT = 280;

/** Floating command list anchored to the caret. Keyboard is handled upstream. */
export function SlashMenu({
  commands,
  activeIndex,
  coords,
  onSelect,
  onHover,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active row in view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Flip above the line if it would overflow the viewport bottom.
  const wouldOverflow = coords.bottom + MENU_MAX_HEIGHT > window.innerHeight;
  const left = Math.min(coords.left, window.innerWidth - MENU_WIDTH - 12);
  const style: React.CSSProperties = wouldOverflow
    ? { left, bottom: window.innerHeight - coords.top + 6, position: 'fixed' }
    : { left, top: coords.bottom + 6, position: 'fixed' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      style={{ ...style, width: MENU_WIDTH }}
      className="z-[80] overflow-hidden rounded-lg border border-border bg-bg-subtle shadow-lg"
      // Don't steal focus from the editor.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        ref={listRef}
        className="max-h-[280px] overflow-y-auto p-1"
        role="listbox"
      >
        {commands.map((cmd, i) => {
          const Icon = cmd.icon;
          const active = i === activeIndex;
          return (
            <button
              key={cmd.id}
              role="option"
              aria-selected={active}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(cmd)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
                active ? 'bg-accent-soft' : 'hover:bg-bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg',
                  active && 'border-accent/30 text-accent',
                )}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">
                  {cmd.title}
                </span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  {cmd.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
