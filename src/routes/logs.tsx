import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Pulse } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { Page, PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeTime, fullTimestamp, dayLabel } from '@/lib/format';
import { cn } from '@/lib/classnames';

const PREFIXES = ['all', 'auth', 'posts', 'media', 'users'] as const;
type Prefix = (typeof PREFIXES)[number];

// The backend dropped /api/logs, so it's no longer in the generated schema and
// this route is currently unreachable (no nav/router entry). Kept intact behind
// a local type so it builds and can be restored verbatim if logs return.
interface LogEntry {
  id: number;
  event: string;
  target?: string | null;
  actor_id?: number | null;
  audit: boolean;
  created_at: string;
}

function eventStyle(event: string) {
  if (event.endsWith('publish')) return 'bg-accent-soft text-accent';
  if (event.endsWith('delete')) return 'bg-danger/10 text-danger';
  return 'bg-bg-muted text-fg-muted';
}

export default function Logs() {
  const [prefix, setPrefix] = useState<Prefix>('all');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [actors, setActors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  // Resolve actor_id → display name from the user roster (admin-only page).
  useEffect(() => {
    call(api.GET('/api/users', { params: { query: { page: 1, page_size: 200 } } }))
      .then((p) =>
        setActors(Object.fromEntries(p.items.map((u) => [u.id, u.display_name]))),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Cast: /api/logs is absent from the typed client until the backend re-adds it.
    call<{ items: LogEntry[] }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.GET as any)('/api/logs', {
        params: {
          query: {
            page: 1,
            page_size: 100,
            ...(prefix !== 'all' && { event_prefix: prefix }),
          },
        },
      }),
    )
      .then((p) => !cancelled && setEntries(p.items))
      .catch(
        (e) => !cancelled && isApiError(e) && setEntries([]),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  const groups = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const key = dayLabel(e.created_at);
      const bucket = map.get(key) ?? [];
      bucket.push(e);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <Page width="text">
      <PageHeader
        title="Activity"
        description="Everything that's happened, newest first."
      />

      <div className="mt-5 flex items-center gap-1 rounded-md bg-bg-muted p-0.5">
        {PREFIXES.map((p) => (
          <button
            key={p}
            onClick={() => setPrefix(p)}
            className={cn(
              'rounded px-3 py-1 text-sm capitalize transition-colors',
              prefix === p
                ? 'bg-bg text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Pulse}
          title="Nothing logged yet."
          hint="Activity shows up here as you publish, upload, and sign in."
        />
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map(([day, items]) => (
            <div key={day}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {day}
              </p>
              <div className="relative space-y-1 border-l border-border pl-5">
                {items.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                    className="relative flex items-center gap-3 py-1.5"
                  >
                    <span
                      className={cn(
                        'absolute -left-[23px] h-1.5 w-1.5 rounded-full',
                        e.audit ? 'bg-accent' : 'bg-border-strong',
                      )}
                    />
                    <span
                      className={cn(
                        'shrink-0 rounded-pill px-2 py-0.5 font-mono text-[11px]',
                        eventStyle(e.event),
                      )}
                    >
                      {e.event}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {e.actor_id != null && (
                        <span className="text-fg-muted">
                          {actors[e.actor_id] ?? `User #${e.actor_id}`}
                        </span>
                      )}
                      {e.target && (
                        <span className="text-fg"> {e.target}</span>
                      )}
                    </span>
                    <span
                      title={fullTimestamp(e.created_at)}
                      className="shrink-0 text-xs text-fg-subtle tnum"
                    >
                      {relativeTime(e.created_at)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
