import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label?: string;
  className?: string;
}

/** Centered dialog. z-60 so it can sit above an open Sheet (z-50). */
export function Modal({ open, onClose, children, label, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal to <body> so the fixed overlay escapes any parent stacking context.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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
              'relative w-full max-w-md rounded-xl border border-border bg-bg-subtle shadow-lg',
              className,
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
