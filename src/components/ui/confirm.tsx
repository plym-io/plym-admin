import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

interface Props {
  /** Icon for the trigger button. */
  icon: Icon;
  /** Accessible label + tooltip for the trigger. */
  label: string;
  /** Short question shown in the confirm bubble, e.g. "Delete this post?". */
  question: string;
  /** Label on the confirm action button, e.g. "Delete". */
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'default';
  className?: string;
  /** Stop click events bubbling to a parent row. */
  stopPropagation?: boolean;
}

/**
 * Icon button that asks for confirmation in an anchored popover before firing.
 * Used for actions with no undo (publish toggle, delete, password reset).
 */
export function ConfirmButton({
  icon: Icon,
  label,
  question,
  confirmLabel,
  onConfirm,
  tone = 'default',
  className,
  stopPropagation = true,
}: Props) {
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

  const guard = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  return (
    <div ref={ref} className="relative" onClick={guard}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          guard(e);
          setOpen((o) => !o);
        }}
        className={cn(
          'rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg',
          tone === 'danger' && 'hover:bg-danger/10 hover:text-danger',
          open && (tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-bg-muted text-fg'),
          className,
        )}
      >
        <Icon size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-border bg-bg-subtle p-3 text-left shadow-lg"
          >
            <p className="text-[13px] text-fg">{question}</p>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  guard(e);
                  setOpen(false);
                }}
                className="rounded-md px-2.5 py-1 text-[13px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={(e) => {
                  guard(e);
                  setOpen(false);
                  onConfirm();
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[13px] font-medium text-white transition-colors',
                  tone === 'danger'
                    ? 'bg-danger hover:brightness-110'
                    : 'bg-fg hover:bg-fg/90',
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
