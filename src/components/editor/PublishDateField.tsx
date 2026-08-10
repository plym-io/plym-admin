import { useEffect, useRef, useState } from 'react';
import { CalendarBlank, Plus, X } from '@phosphor-icons/react';
import { fromInputValue, renderedDate, toInputValue } from '@/lib/publish-date';
import type { PostStatus } from '@/types';
import { cn } from '@/lib/classnames';

interface Props {
  /** The committed `published_at` from the post, as ISO-8601 or null. */
  value: string | null;
  /** Only used to word the hint — the field is editable in every status. */
  status: PostStatus;
  /** Commit a new date (or null to clear). Triggers autosave upstream. */
  onCommit: (value: string | null) => void;
}

/**
 * Right-rail publish-date field, for carrying over the date of a post first
 * written elsewhere. Editable on a draft as well as a live post: a date set
 * before publishing survives it rather than being overwritten by the clock.
 *
 * The control is on UTC, and says so. The post template renders the stored
 * instant with `strftime('%B %d, %Y')`, so a local-time control would let an
 * author set a day and publish under the one either side of it. The rendered
 * date is echoed below the input so the day is read, not calculated.
 */
export function PublishDateField({ value, status, onCommit }: Props) {
  const [expanded, setExpanded] = useState(value !== null);
  const [text, setText] = useState(toInputValue(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(toInputValue(value));
    if (value !== null) setExpanded(true);
  }, [value]);

  const expand = () => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    // Compare at the granularity the field edits, not as ISO strings: the API
    // stores microseconds, so a post published by the trigger comes back as
    // 09:30:31.652060Z. Against the raw value every blur would look like an
    // edit and rewrite the date — re-rendering the live post — for nothing.
    if (text === toInputValue(value)) return;
    const next = fromInputValue(text);
    onCommit(next);
    if (next === null) setExpanded(false);
  };

  const clear = () => {
    setText('');
    setExpanded(false);
    if (value !== null) onCommit(null);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        className="flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <Plus size={13} weight="bold" />
        Set publish date
      </button>
    );
  }

  const pending = fromInputValue(text);

  return (
    <div className="space-y-2" id="publish-date-field">
      <div className="flex items-center justify-between">
        <label
          htmlFor="publish-date-input"
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle"
        >
          Publish date
          {value !== null && (
            <CalendarBlank size={13} weight="bold" className="text-accent" aria-hidden />
          )}
        </label>
        <button
          type="button"
          aria-label={value === null ? 'Cancel' : 'Clear date'}
          title={value === null ? 'Cancel' : 'Clear the publish date'}
          onClick={clear}
          className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <X size={13} />
        </button>
      </div>
      <div className="relative">
        <input
          id="publish-date-input"
          ref={inputRef}
          type="datetime-local"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape' && value === null) {
              setText('');
              setExpanded(false);
            }
          }}
          className={cn(
            'h-9 w-full rounded-md border border-border bg-bg pl-3 pr-12 text-[13px] text-fg outline-none transition-colors',
            'hover:border-border-strong focus:border-accent',
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-fg-subtle"
        >
          UTC
        </span>
      </div>
      {pending ? (
        <p className="text-xs text-fg-subtle">
          Shows as {renderedDate(pending)}
          {status === 'published' ? '.' : ' once published.'}
        </p>
      ) : (
        <p className="text-xs text-fg-subtle">
          Defaults to the moment this post is first published.
        </p>
      )}
    </div>
  );
}
