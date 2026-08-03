import { useEffect, useState } from 'react';
import { cn } from '@/lib/classnames';

/** "Sam Rivera" → "SR". Falls back to a placeholder rather than nothing. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface Props {
  /** The profile picture, when the account has one. */
  src?: string | null;
  name?: string | null;
  size?: number;
  /** `accent` marks the signed-in user; everyone else is neutral. */
  tone?: 'neutral' | 'accent';
  className?: string;
}

/**
 * A person, drawn once. Shows the avatar when there is one and it loads, and
 * their initials when there isn't — including when the URL is set but broken,
 * which is the case a plain `<img>` renders as a torn-page icon.
 */
export function Avatar({ src, name, size = 32, tone = 'neutral', className }: Props) {
  const [failed, setFailed] = useState(false);

  // A new URL — a just-edited profile, or a different row — gets its own try.
  useEffect(() => setFailed(false), [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none',
        showImage
          ? 'bg-bg-muted'
          : tone === 'accent'
            ? 'bg-accent-soft text-accent'
            : 'bg-bg-muted text-fg-muted',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt={name ?? ''}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
