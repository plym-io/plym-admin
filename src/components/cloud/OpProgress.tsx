import { useEffect, useRef, useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { getOpEvents } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { cn } from '@/lib/classnames';
import type { OpEvent } from '@/types/cloud';

/** How often to ask for new events — the gateway suggests about a second. */
const POLL_MS = 1000;

/**
 * A rebuild takes the blog down and back up, so the gateway itself can blink
 * mid-operation. Only give up after this many consecutive failed polls.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

type Tone = 'info' | 'warn' | 'error' | 'done';

export interface LogLine {
  text: string;
  tone: Tone;
}

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
  /** Called once, when the operation stops moving. */
  onSettled?: (state: 'succeeded' | 'failed') => void;
  className?: string;
}

/**
 * A live view of one asynchronous operation: poll its events, render them as
 * they arrive, stop when it settles. This is the only honest way to show a
 * deploy — the work outlives the request that started it.
 */
export function OpProgress({ opId, onSettled, className }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let after = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const page = await getOpEvents(opId, after);
        if (stopped) return;
        failures = 0;
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
        if (++failures >= MAX_CONSECUTIVE_FAILURES) {
          setError(
            isApiError(e) ? e.message : 'Lost contact with the deploy while it was running',
          );
          return;
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [opId]);

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
