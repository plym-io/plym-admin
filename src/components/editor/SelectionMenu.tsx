import { useEffect } from 'react';
import { motion } from 'motion/react';
import { MENU_ITEMS, type EditorActions } from './FormatToolbar';
import { Kbd } from '@/components/ui/kbd';

const WIDTH = 190;

interface Props {
  /** Viewport coords of the right-click. */
  x: number;
  y: number;
  actions: EditorActions;
  onClose: () => void;
}

/**
 * The menu you get when you right-click a selection. Replaces the browser's
 * own only while text is selected inside the editor — right-clicking anywhere
 * else (or with no selection) still gets spellcheck, paste and the rest.
 */
export function SelectionMenu({ x, y, actions, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const height = MENU_ITEMS.length * 30 + 8;
  const left = Math.min(x, window.innerWidth - WIDTH - 8);
  const top = Math.min(y, window.innerHeight - height - 8);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'fixed', left, top, width: WIDTH }}
      className="z-[90] overflow-hidden rounded-lg border border-border bg-bg p-1 shadow-lg"
      role="menu"
      // Keep the selection alive while the menu is used.
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            role="menuitem"
            onClick={() => {
              item.run(actions);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-bg-muted"
          >
            <Icon size={15} className="shrink-0 text-fg-muted" />
            <span className="flex-1">{item.label}</span>
            {item.keys && <Kbd keys={item.keys} />}
          </button>
        );
      })}
    </motion.div>
  );
}
