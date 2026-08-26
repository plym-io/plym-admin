import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Side panel (default) or bottom sheet that slides up from the page. */
  side?: 'right' | 'bottom';
  className?: string;
  label?: string;
}

/** A single side/bottom sheet. We never stack — one panel max (BRD §4). */
export function Sheet({
  open,
  onClose,
  children,
  side = 'right',
  className,
  label,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isRight = side === 'right';

  // Portal to <body> so the fixed overlay escapes any parent stacking context
  // (e.g. the TopBar's backdrop-blur, which would otherwise trap it below the
  // page). React context still flows through the portal.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex"
          style={{ justifyContent: isRight ? 'flex-end' : 'center', alignItems: isRight ? 'stretch' : 'flex-end' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cn(
              'relative bg-bg-subtle shadow-lg',
              isRight
                ? 'h-full w-full max-w-md border-l border-border'
                : 'w-full max-w-lg rounded-t-xl border border-border',
              className,
            )}
            initial={isRight ? { x: 40, opacity: 0 } : { y: 80, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={isRight ? { x: 40, opacity: 0 } : { y: 80, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <X size={16} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
