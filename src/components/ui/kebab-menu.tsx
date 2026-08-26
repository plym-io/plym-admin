import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DotsThreeVertical, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

export interface KebabMenuItem {
  icon: Icon;
  label: string;
  tone?: 'danger' | 'default';
  onSelect: () => void;
}

interface Props {
  items: KebabMenuItem[];
  /** Accessible label + tooltip for the trigger. */
  label?: string;
  className?: string;
}

/** Icon-trigger dropdown for secondary row actions. */
export function KebabMenu({ items, label = 'More actions', className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          'rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg',
          open && 'bg-bg-muted text-fg',
          className,
        )}
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-9 z-50 w-40 rounded-lg border border-border bg-bg-subtle p-1 shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-bg-muted',
                  item.tone === 'danger' && 'text-danger hover:bg-danger/10',
                )}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
