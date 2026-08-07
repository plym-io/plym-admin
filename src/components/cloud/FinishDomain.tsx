import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowSquareOut, CaretDown, CheckCircle } from '@phosphor-icons/react';
import { setHome } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { cn } from '@/lib/classnames';
import type { CloudError } from '@/api/cloud';
import type { Finish, GuideCheck } from '@/types/cloud';
import { Button } from '@/components/ui/button';
import { Snippet } from './Snippet';
import { OpProgress } from './OpProgress';

/**
 * The checks the gateway ships with a strategy. They are curl commands, which
 * is the right answer for someone who wants proof and the wrong thing to put in
 * front of someone who doesn't — so they are offered, not imposed.
 */
function Checks({ checks }: { checks: GuideCheck[] }) {
  const [open, setOpen] = useState(false);
  if (checks.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <CaretDown
          size={12}
          weight="bold"
          className={cn('transition-transform', open && 'rotate-180')}
        />
        Check it yourself
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {checks.map((check, i) => (
            <div key={`${check.command}-${i}`}>
              {check.title && <p className="mb-1 text-[13.5px] text-fg">{check.title}</p>}
              {check.command && <Snippet code={check.command} />}
              {/* The subdomain check's `expect` is a short paragraph — it reads
                  the 404 body back to you and says what it proves — so it wraps
                  and keeps its own line breaks rather than being clipped. */}
              {check.expect && (
                <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed text-fg-muted">
                  <span className="text-fg-subtle">Expect: </span>
                  {check.expect}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The last step, and the only one that changes anything.
 *
 * Up to here the owner has been working in someone else's control panel and
 * plym has no way to know they finished — so they say so, and this applies it:
 * `PUT /home` re-renders every page, canonical tag and sitemap entry for the
 * new address, and for a subdomain registers the hostname and orders its
 * certificate in the same operation. Nothing here waits on a human at plym.
 */
export function FinishDomain({
  finish,
  checks,
  onApplied,
}: {
  finish: Finish;
  checks: GuideCheck[];
  /** Fired once the operation settles, so the screen can reload the truth. */
  onApplied: () => void;
}) {
  const [opId, setOpId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<CloudError | null>(null);
  const [state, setState] = useState<'succeeded' | 'failed' | null>(null);

  const apply = async () => {
    setStarting(true);
    setError(null);
    try {
      const accepted = await setHome(finish.home, finish.register_hostname);
      setOpId(accepted.op_id);
    } catch (e) {
      setError(isApiError(e) ? (e as CloudError) : null);
      if (!isApiError(e)) toast.error('Could not move the blog to its new address.');
      setStarting(false);
    }
  };

  const settle = (next: 'succeeded' | 'failed') => {
    setState(next);
    if (next === 'succeeded') toast.success('Your blog has moved.');
    onApplied();
  };

  if (state === 'succeeded') {
    return (
      <div>
        <div className="flex gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
          <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-fg">Your blog lives here now</p>
            <p className="mt-0.5 break-all font-mono text-[13px] text-fg-muted">{finish.home}</p>
            {finish.register_hostname && (
              <p className="mt-2 text-[13px] text-fg-muted">
                The HTTPS certificate is ordered and issues by itself once your DNS record
                resolves. That is usually minutes, and there is nothing more for you to do.
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => window.open(finish.home, '_blank', 'noopener')}
          >
            Visit <ArrowSquareOut size={14} />
          </Button>
        </div>
        <Checks checks={checks} />
      </div>
    );
  }

  return (
    <div>
      {finish.title && <p className="text-[14px] font-medium text-fg">{finish.title}</p>}
      {finish.detail && (
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg-muted">{finish.detail}</p>
      )}

      <div className="mt-3 rounded-lg border border-border bg-bg p-4">
        <p className="text-[13px] text-fg-muted">Your blog will move to</p>
        <p className="mt-0.5 break-all font-mono text-[14px] text-fg">{finish.home}</p>
        <p className="mt-2 text-[13px] text-fg-muted">
          Every page, link and sitemap entry is rewritten for the new address.
          {finish.register_hostname &&
            ' plym registers the hostname and orders its HTTPS certificate at the same time.'}
        </p>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
          <p className="text-sm text-danger">{error.message}</p>
          {error.remedy && <p className="mt-1 text-[13px] text-fg-muted">{error.remedy}</p>}
        </div>
      )}

      {opId ? (
        <OpProgress opId={opId} onSettled={settle} className="mt-4" />
      ) : (
        <Button variant="accent" className="mt-4" onClick={() => void apply()} disabled={starting}>
          {starting ? 'Starting…' : 'Move my blog'}
        </Button>
      )}

      {state === 'failed' && (
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setOpId(null);
            setStarting(false);
            setState(null);
          }}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
