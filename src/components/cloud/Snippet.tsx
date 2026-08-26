import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/classnames';

/**
 * A block of text meant to be pasted somewhere else — a DNS record, an nginx
 * stanza, a curl check. The gateway renders these against the blog's real
 * hostname, so they are shown exactly as they arrive and never reflowed.
 */
export function Snippet({
  code,
  label,
  filename,
  className,
}: {
  code: string;
  label?: string;
  /** Where the snippet belongs, when it belongs in a file. */
  filename?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // The filename is part of the instruction, not decoration, so it rides on the
  // block itself rather than sitting in prose above it.
  const heading = label || filename;

  return (
    <div className={cn('group relative', className)}>
      {heading && (
        <div className="flex items-baseline justify-between gap-3 rounded-t-lg border border-b-0 border-border bg-bg-subtle px-3 py-1.5">
          {label && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              {label}
            </p>
          )}
          {filename && (
            <p className="truncate font-mono text-[11.5px] text-fg-muted" title={filename}>
              {filename}
            </p>
          )}
        </div>
      )}
      <pre
        className={cn(
          'overflow-x-auto border border-border bg-bg-muted px-3 py-2.5 pr-11 font-mono text-[12.5px] leading-relaxed text-fg',
          heading ? 'rounded-b-lg' : 'rounded-lg',
        )}
      >
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
        className={cn(
          'absolute right-2 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg',
          heading ? 'top-10' : 'top-2',
        )}
      >
        {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
      </button>
    </div>
  );
}
