import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from '@phosphor-icons/react';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** Chip-style tag input. Comma/Enter adds, Backspace on empty removes last. */
export function TagsInput({ tags, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const value = raw.trim().replace(/^#/, '').toLowerCase();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg p-1.5 transition-colors focus-within:border-accent">
        <AnimatePresence initial={false}>
          {tags.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
            >
              #{tag}
              <button
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="rounded-full transition-opacity hover:opacity-70"
              >
                <X size={11} weight="bold" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) add(v.slice(0, -1));
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={tags.length ? '' : 'Add a tag…'}
          className="min-w-[80px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-fg-subtle"
        />
      </div>
    </div>
  );
}
