import { useEffect, useRef, useState } from 'react';
import { CaretDown, Plus, Trash } from '@phosphor-icons/react';
import {
  LINK_PLATFORMS,
  TOP_PLATFORMS,
  MORE_PLATFORMS,
  platformLabel,
  validateLinkUrl,
  type ProfileLink,
} from '@/lib/profile-links';
import { cn } from '@/lib/classnames';

interface Props {
  links: ProfileLink[];
  onChange: (links: ProfileLink[]) => void;
  /** After a failed submit, reveal errors on every row (not just touched ones). */
  showErrors?: boolean;
}

/**
 * Editable list of profile links (PATCH /api/users/me → `links`). Mirrors the
 * canonical-URL affordance: a quiet "Add Link" expands a row with a platform
 * picker and a URL input. Structural URL validation surfaces inline on blur.
 */
export function ProfileLinksField({ links, onChange, showErrors }: Props) {
  const [touched, setTouched] = useState<Set<number>>(new Set());

  const update = (i: number, patch: Partial<ProfileLink>) =>
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const add = () => onChange([...links, { type: '', url: '' }]);

  const remove = (i: number) => {
    onChange(links.filter((_, idx) => idx !== i));
    // Re-index the touched set so highlights follow the right rows.
    setTouched((prev) => {
      const next = new Set<number>();
      prev.forEach((t) => {
        if (t < i) next.add(t);
        else if (t > i) next.add(t - 1);
      });
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-sm text-fg-muted">Links</span>

      {links.map((link, i) => {
        const urlError = link.url.trim() !== '' ? validateLinkUrl(link.url) : null;
        const typeError = link.url.trim() !== '' && !link.type ? 'Choose a platform.' : null;
        const error = urlError ?? typeError;
        const show = showErrors || touched.has(i);

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <PlatformSelect
                value={link.type}
                onSelect={(type) => update(i, { type })}
                invalid={!!(show && typeError)}
              />
              <input
                type="url"
                inputMode="url"
                spellCheck={false}
                value={link.url}
                placeholder="https://…"
                onChange={(e) => update(i, { url: e.target.value })}
                onBlur={() => setTouched((prev) => new Set(prev).add(i))}
                aria-invalid={!!(show && error)}
                className={cn(
                  'h-9 min-w-0 flex-1 rounded-md border bg-bg px-3 text-sm text-fg outline-none transition-colors',
                  'placeholder:text-fg-subtle hover:border-border-strong focus:border-accent',
                  show && error ? 'border-danger' : 'border-border',
                )}
              />
              <button
                type="button"
                aria-label="Remove link"
                onClick={() => remove(i)}
                className="rounded-md p-2 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-danger"
              >
                <Trash size={15} />
              </button>
            </div>
            {show && error && <p className="text-xs text-danger">{error}</p>}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <Plus size={13} weight="bold" />
        Add Link
      </button>
    </div>
  );
}

function PlatformSelect({
  value,
  onSelect,
  invalid,
}: {
  value: string;
  onSelect: (value: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
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

  const visible = expanded ? LINK_PLATFORMS : TOP_PLATFORMS;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-32 items-center justify-between gap-1 rounded-md border bg-bg px-3 text-sm outline-none transition-colors',
          'hover:border-border-strong focus:border-accent',
          value ? 'text-fg' : 'text-fg-subtle',
          invalid ? 'border-danger' : 'border-border',
        )}
      >
        <span className="truncate">{value ? platformLabel(value) : 'Platform'}</span>
        <CaretDown size={13} className="shrink-0 text-fg-subtle" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-10 z-50 max-h-64 w-40 overflow-y-auto rounded-lg border border-border bg-bg-subtle p-1 shadow-lg"
        >
          {visible.map((p) => (
            <button
              key={p.value}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(p.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-bg-muted',
                p.value === value ? 'text-accent' : 'text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
          {!expanded && MORE_PLATFORMS.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              More…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
