import { useEffect, useRef, useState } from 'react';
import { LinkSimple, Plus, X } from '@phosphor-icons/react';
import { validateCanonical } from '@/lib/canonical';
import { cn } from '@/lib/classnames';

interface Props {
  /** The committed value from the post (string or null). */
  value: string | null;
  /** Server-side 422 message for canonical_url, if any. */
  serverError?: string | null;
  /** Commit a validated value (or null to clear). Triggers autosave upstream. */
  onCommit: (value: string | null) => void;
  /** Clear the server error when the user starts editing again. */
  onEdit?: () => void;
}

/**
 * Right-rail canonical-URL field (FOLLOWUP_CANONICAL §editor right rail).
 * Optional and collapsed by default — a quiet "Add canonical URL" affordance
 * expands to the input. Validates structurally with zod, autosaves on blur,
 * surfaces the empty-state hint and inline 422s.
 */
export function CanonicalField({ value, serverError, onCommit, onEdit }: Props) {
  const hasValue = (value ?? '') !== '';
  const [expanded, setExpanded] = useState(hasValue);
  const [text, setText] = useState(value ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the input in sync when the post reloads / the value changes upstream.
  useEffect(() => {
    setText(value ?? '');
    if ((value ?? '') !== '') setExpanded(true);
  }, [value]);

  const error = localError ?? serverError ?? null;

  const expand = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    const { value: next, error: err } = validateCanonical(text);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    if ((next ?? '') !== (value ?? '')) onCommit(next);
    // Collapse again once it's been emptied.
    if ((next ?? '') === '') setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        className="flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <Plus size={13} weight="bold" />
        Add canonical URL
      </button>
    );
  }

  return (
    <div className="space-y-2" id="canonical-field">
      <div className="flex items-center justify-between">
        <label
          htmlFor="canonical-input"
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle"
        >
          Canonical URL
          {hasValue && (
            <LinkSimple
              size={13}
              weight="bold"
              className="text-accent"
              aria-label="Canonical override in effect"
            />
          )}
        </label>
        {!hasValue && (
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => {
              setText('');
              setLocalError(null);
              setExpanded(false);
            }}
            className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <input
        id="canonical-input"
        ref={inputRef}
        type="url"
        inputMode="url"
        spellCheck={false}
        value={text}
        placeholder="https://example.com/original"
        onChange={(e) => {
          setText(e.target.value);
          if (localError) setLocalError(null);
          onEdit?.();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape' && !hasValue) {
            setText('');
            setExpanded(false);
          }
        }}
        aria-invalid={!!error}
        className={cn(
          'h-9 w-full rounded-md border bg-bg px-3 font-mono text-[13px] text-fg outline-none transition-colors',
          'placeholder:text-fg-subtle/60 hover:border-border-strong focus:border-accent',
          error ? 'border-danger' : 'border-border',
        )}
      />
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        text.trim() === '' && (
          <p className="text-xs text-fg-subtle">Where this post originally lived.</p>
        )
      )}
    </div>
  );
}
