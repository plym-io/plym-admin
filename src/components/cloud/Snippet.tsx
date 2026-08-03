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
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={cn('group relative', className)}>
      {label && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          {label}
        </p>
      )}
      <pre className="overflow-x-auto rounded-lg border border-border bg-bg-muted px-3 py-2.5 pr-11 font-mono text-[12.5px] leading-relaxed text-fg">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy'}
        title={copied ? 'Copied' : 'Copy'}
        className={cn(
          'absolute right-2 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg',
          label ? 'top-7' : 'top-2',
        )}
      >
        {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
      </button>
    </div>
  );
}
