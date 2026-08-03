import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Warning } from '@phosphor-icons/react';
import { applySettings, planSettings, type CloudError } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { displayValue, isHeavy } from '@/lib/settings';
import type { Plan } from '@/types/cloud';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImpactBadge, IMPACT_META } from './ImpactBadge';
import { OpProgress } from './OpProgress';

interface Props {
  open: boolean;
  /** The dotted-key patch to apply — only what the user actually changed. */
  patch: Record<string, unknown>;
  onClose: () => void;
  /** Fired once the operation settles, so the screen can reload the truth. */
  onApplied: () => void;
}

/**
 * The one moment in the cloud settings screen where anything reaches the live
 * blog. Everything before it is a draft; this dialog says what is about to
 * happen — resolved by the gateway's own dry run, not guessed here — asks for a
 * yes, and then shows the work as it happens.
 */
export function DeployModal({ open, patch, onClose, onApplied }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<CloudError | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [finished, setFinished] = useState(false);

  // Dry-run on open. Nothing is written, so it is safe to redo every time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPlan(null);
    setPlanError(null);
    setOpId(null);
    setFinished(false);
    planSettings(patch)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setPlanError(isApiError(e) ? (e as CloudError) : null));
    return () => {
      cancelled = true;
    };
    // `patch` is memoized by the caller, so this re-plans when the draft
    // changes and not on every render of the screen behind the dialog.
  }, [open, patch]);

  const deploy = async () => {
    setApplying(true);
    try {
      const accepted = await applySettings(patch);
      setOpId(accepted.op_id);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not start the deploy');
      setApplying(false);
    }
  };

  const settle = (state: 'succeeded' | 'failed') => {
    setFinished(true);
    if (state === 'succeeded') toast.success('Changes are live.');
    else toast.error('The deploy failed. The log has the details.');
  };

  const close = () => {
    if (opId && !finished) toast('Deploy is still running — it will finish on its own.');
    onClose();
    if (opId) onApplied();
  };

  // Fall back to the keys we are sending if the gateway resolves no changes of
  // its own — an empty table would read as "nothing will happen".
  const rows =
    plan && plan.changes.length
      ? plan.changes
      : Object.entries(patch).map(([key, to]) => ({ key, from: undefined, to }));

  const impact = plan?.impact ?? 'reload';

  return (
    <Modal open={open} onClose={close} label="Deploy changes" className="max-w-lg">
      <div className="p-5">
        <h2 className="text-[17px] font-semibold tracking-tight text-fg">
          {opId ? 'Deploying' : 'Deploy these changes?'}
        </h2>

        {!opId && (
          <p className="mt-1 text-sm text-fg-muted">
            This is the final step — everything below is applied to your live blog.
            Read it through before you go ahead.
          </p>
        )}

        {planError && !opId && (
          <div className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p className="text-sm text-danger">{planError.message}</p>
            {planError.remedy && (
              <p className="mt-1 text-[13px] text-fg-muted">{planError.remedy}</p>
            )}
          </div>
        )}

        {!opId && !plan && !planError && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!opId && (plan || planError) && (
          <>
            <dl className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {rows.map((c) => (
                <div key={c.key} className="flex items-center gap-3 px-3 py-2">
                  <dt
                    className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-muted"
                    title={c.key}
                  >
                    {c.key}
                  </dt>
                  <dd className="flex min-w-0 shrink-0 items-center gap-2 text-[13px]">
                    {c.from !== undefined && (
                      <>
                        <span className="max-w-[9rem] truncate text-fg-subtle line-through">
                          {displayValue(c.from)}
                        </span>
                        <ArrowRight size={12} className="shrink-0 text-fg-subtle" />
                      </>
                    )}
                    <span className="max-w-[11rem] truncate font-medium text-fg">
                      {displayValue(c.to)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex items-start gap-2.5">
              <ImpactBadge impact={impact} className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] text-fg">{IMPACT_META[impact].blurb}</p>
                {plan?.effects.map((e) => (
                  <p key={e} className="mt-1 text-[13px] text-fg-muted">
                    {e}
                  </p>
                ))}
                {isHeavy(impact) && (
                  // Subtle on purpose: a limit, not a scolding.
                  <p className="mt-2 text-[12.5px] text-fg-subtle">
                    Changes this heavy — a new template, anything that rebuilds the
                    whole site — can be applied three times a day, so they are worth
                    batching.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {opId && <OpProgress opId={opId} onSettled={settle} className="mt-4" />}

        <div className="mt-5 flex items-center justify-end gap-2">
          {!opId ? (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => void deploy()}
                disabled={applying || Boolean(planError)}
              >
                {applying ? 'Starting…' : 'Deploy'}
              </Button>
            </>
          ) : (
            <Button variant={finished ? 'primary' : 'ghost'} onClick={close}>
              {finished ? 'Done' : 'Leave it running'}
            </Button>
          )}
        </div>

        {!opId && !planError && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-fg-subtle">
            <Warning size={13} /> There is no undo from this screen.
          </p>
        )}
      </div>
    </Modal>
  );
}
