import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X } from '@phosphor-icons/react';
import type { Faq } from '@/types';
import { FaqPicker } from '@/components/editor/FaqPicker';

interface Props {
  faqs: Faq[];
  onChange: (faqs: Faq[]) => void;
}

/** Compact rail widget — attached FAQs as chips, picker sheet for the rest. */
export function FaqSection({ faqs, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        FAQs
      </label>
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {faqs.map((faq) => (
            <motion.div
              key={faq.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-start gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-fg" title={faq.question}>
                {faq.question}
              </span>
              <button
                onClick={() => onChange(faqs.filter((f) => f.id !== faq.id))}
                aria-label={`Remove ${faq.question}`}
                className="shrink-0 rounded-full text-fg-subtle transition-opacity hover:opacity-70"
              >
                <X size={11} weight="bold" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={12} weight="bold" /> Add FAQ
        </button>
      </div>

      <FaqPicker open={open} onClose={() => setOpen(false)} selected={faqs} onChange={onChange} />
    </div>
  );
}
