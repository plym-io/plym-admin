import { useEffect } from 'react';
import { ArrowRight, Signpost } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';
import { Button } from '@/components/ui/button';
import type { PanelMove } from '@/lib/base';

/** How long the "we're moving you" panel is readable before it moves you. */
const MOVE_DELAY_MS = 4000;

/**
 * The consequence that isn't about the blog: this panel is served from under
 * the blog's prefix, so moving the blog moves the panel. Said before the click,
 * not discovered after it.
 */
export function PanelMoveNotice({ move, className }: { move: PanelMove; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle p-3',
        className,
      )}
    >
      <Signpost size={16} className="mt-px shrink-0 text-fg-subtle" />
      <div className="min-w-0">
        <p className="text-[13px] text-fg">This admin panel moves too.</p>
        <p className="mt-0.5 break-all font-mono text-[12.5px] text-fg-muted">
          {move.adminUrl}
        </p>
        <p className="mt-1 text-[12.5px] text-fg-subtle">
          You'll be taken there when the deploy finishes. Update any bookmark you have to
          this page.
        </p>
      </div>
    </div>
  );
}

/**
 * The hand-off, once the address under this page has changed.
 *
 * There is no "back to the screen behind this" from here: that URL is gone, and
 * so is the API it was calling. The only useful thing left to do is name the
 * address that replaced it and go.
 *
 * `outcome` is the difference between knowing and guessing, and it decides
 * whether this moves anyone on its own. A deploy watched to a clean finish is
 * proof the new address exists, so waiting on a click serves nobody. A deploy
 * this page lost sight of is not proof of anything — it is most likely the move
 * landing, which is why the new address is offered, but sending someone to a
 * page that may not answer is worse than letting them decide to try it.
 */
export function PanelMoved({
  move,
  outcome,
  className,
}: {
  move: PanelMove;
  outcome: 'succeeded' | 'lost';
  className?: string;
}) {
  useEffect(() => {
    if (outcome !== 'succeeded') return;
    const timer = setTimeout(() => window.location.replace(move.adminUrl), MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [outcome, move.adminUrl]);

  const known = outcome === 'succeeded';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        known ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5',
        className,
      )}
    >
      <p className="text-[13.5px] font-medium text-fg">
        {known
          ? 'Your blog has moved — and this panel with it.'
          : 'This page’s address was changing, and it lost the deploy.'}
      </p>
      <p className="mt-0.5 break-all font-mono text-[12.5px] text-fg-muted">
        {move.adminUrl}
      </p>
      <p className="mt-1.5 text-[12.5px] text-fg-subtle">
        {known
          ? 'Taking you there now. The old address no longer answers.'
          : 'That is where the panel lives if the move landed, and the deploy log continues there. This address will not come back either way.'}
      </p>
      {/* The address is the whole point of this card, so it is a thing to
          press. Leaving it as text to select and retype is how someone who
          has just been told their panel moved ends up stuck on a dead page. */}
      <Button
        variant={known ? 'secondary' : 'accent'}
        size="sm"
        className="mt-2.5"
        onClick={() => window.location.replace(move.adminUrl)}
      >
        Go to the new address <ArrowRight size={14} />
      </Button>
    </div>
  );
}
