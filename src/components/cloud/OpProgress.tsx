import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Signpost, WarningCircle } from '@phosphor-icons/react';
import { getOpEvents } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { cn } from '@/lib/classnames';
import type { OpEvent } from '@/types/cloud';

/** How often to ask for new events — the gateway suggests about a second. */
const POLL_MS = 1000;

/**
 * A heavy operation takes the blog down and back up, and the edge answers 5xx
 * for the twenty-odd seconds that takes. Nothing is wrong until the gateway has
 * been unreachable for this long — a budget, not a count of tries, because the
 * thing being waited on is a restart rather than a flaky request.
 */
const MAX_QUIET_MS = 90_000;

type Tone = 'info' | 'warn' | 'error' | 'done';

export interface LogLine {
  text: string;
  tone: Tone;
}

/**
 * How an operation ended, as far as *this page* can tell.
 *
 * `lost` is not a failure. It is this page saying it can no longer see the
 * operation — which is the honest answer when the operation's own job was to
 * move the gateway somewhere this page cannot follow it to.
 */
export type OpOutcome = 'succeeded' | 'failed' | 'lost';

/**
 * One event as a line of log. Events are free-form — the gateway calls them
 * "the operation's steps, warnings and closing summary" — so take the first
 * human-readable field and fall back to the raw JSON rather than dropping a
 * line we don't recognise.
 */
export function formatEvent(event: OpEvent): LogLine {
  const text =
    ['message', 'text', 'detail', 'summary', 'step', 'event', 'name']
      .map((k) => event[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '') ??
    JSON.stringify(event);

  const level = String(event.level ?? event.severity ?? event.kind ?? '').toLowerCase();
  const tone: Tone = level.startsWith('err') || level === 'fatal' || level === 'failed'
    ? 'error'
    : level.startsWith('warn')
      ? 'warn'
      : level === 'done' || level === 'summary' || level === 'succeeded'
        ? 'done'
        : 'info';

  return { text, tone };
}

const TONE_CLASS: Record<Tone, string> = {
  info: 'text-fg-muted',
  warn: 'text-warning',
  error: 'text-danger',
  done: 'text-fg',
};

interface Props {
  opId: string;
  /** Called once, when the operation stops moving or stops being visible. */
  onSettled?: (outcome: OpOutcome) => void;
  /**
   * Where this same gateway answers after the operation, when the operation is
   * one that moves it. Given this, losing the gateway is a thing to follow
   * rather than a thing to report.
   */
  followTo?: string;
  className?: string;
}

/**
 * A live view of one asynchronous operation: poll its events, render them as
 * they arrive, stop when it settles. This is the only honest way to show a
 * deploy — the work outlives the request that started it.
 *
 * It also outlives the gateway's address. A reroute republishes the blog under
 * a different prefix, and the panel and gateway are both served from under that
 * prefix, so the path being polled here stops existing part way through the
 * very operation it is reporting. Two answers have to be told apart to survive
 * that: 5xx is the restart, and waiting is correct; 404 is the mount gone for
 * good, and the operation has to be picked back up at `followTo` or it is never
 * seen to finish. Reading "deploy interrupted" off a deploy that succeeded is
 * how this screen used to end.
 */
export function OpProgress({ opId, onSettled, followTo, className }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  /** Cleared the moment the gateway answers again — it describes a wait. */
  const [restarting, setRestarting] = useState(false);
  /** Never cleared — it describes what happened to this deploy, and stays true. */
  const [followed, setFollowed] = useState(false);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let after = 0;
    /** Undefined until the gateway moves — the panel's own mount. */
    let base: string | undefined;
    let quietSince: number | null = null;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const page = await getOpEvents(opId, after, base);
        if (stopped) return;
        quietSince = null;
        setRestarting(false);
        after = page.next_after ?? after;
        if (page.events?.length) {
          setLines((prev) => [...prev, ...page.events.map(formatEvent)]);
        }
        setState(page.state);
        if (page.state === 'succeeded' || page.state === 'failed') {
          settled.current?.(page.state);
          return;
        }
      } catch (e) {
        if (stopped) return;
        // The one answer that means this path is gone rather than busy. Start
        // again at the new mount from the first event: the operation's log
        // survives the move whole, so it is re-read rather than stitched.
        if (isApiError(e) && e.status === 404 && followTo && base === undefined) {
          base = followTo;
          after = 0;
          quietSince = null;
          setLines([]);
          setRestarting(false);
          setFollowed(true);
        } else {
          quietSince ??= Date.now();
          if (Date.now() - quietSince >= MAX_QUIET_MS) {
            setError(
              isApiError(e) ? e.message : 'Lost contact with the deploy while it was running',
            );
            settled.current?.('lost');
            return;
          }
          setRestarting(true);
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [opId, followTo]);

  // Keep the newest line in view without yanking the whole page around.
  useEffect(() => {
    tail.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);

  const running = state !== 'succeeded' && state !== 'failed' && !error;

  return (
    <div className={cn('rounded-lg border border-border bg-bg', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {running ? (
          <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent" />
        ) : state === 'succeeded' ? (
          <CheckCircle size={16} weight="fill" className="shrink-0 text-success" />
        ) : (
          <WarningCircle size={16} weight="fill" className="shrink-0 text-danger" />
        )}
        <p className="text-[13px] font-medium text-fg">
          {error
            ? 'Deploy interrupted'
            : state === 'succeeded'
              ? 'Done'
              : state === 'failed'
                ? 'Failed'
                : state === 'queued'
                  ? 'Queued…'
                  : 'Working…'}
        </p>
      </div>

      {/* Said while it happens, not explained afterwards: a blog that goes
          quiet mid-deploy is the expected shape of a deploy, and someone
          watching a stalled log has no way to know that. */}
      {running && (followed || restarting) && (
        <div className="flex items-start gap-2 border-b border-border px-3 py-2">
          <Signpost size={14} className="mt-px shrink-0 text-fg-subtle" />
          <p className="text-[12.5px] text-fg-muted">
            {followed
              ? 'Your blog has moved to its new address. Picking the deploy back up there.'
              : 'Your blog is restarting. Waiting for it to answer again.'}
          </p>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto px-3 py-2">
        {lines.length === 0 && !error && (
          <p className="font-mono text-[12px] text-fg-subtle">Waiting for the first step…</p>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            className={cn('font-mono text-[12px] leading-relaxed', TONE_CLASS[line.tone])}
          >
            {line.text}
          </p>
        ))}
        {error && <p className="font-mono text-[12px] text-danger">{error}</p>}
        <div ref={tail} />
      </div>
    </div>
  );
}
