import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import {
  Funnel,
  ArrowsDownUp,
  MagnifyingGlass,
  DownloadSimple,
  Table,
  Tray,
  type Icon,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeTime, fullTimestamp } from '@/lib/format';
import { cn } from '@/lib/classnames';

const PAGE_SIZE = 20;

// /api/submissions isn't in the generated OpenAPI client yet, so this route
// talks to it through a locally-typed cast (mirrors logs.tsx). Remove once the
// endpoint lands in the schema.
type Dict = Record<string, unknown>;
interface Submission {
  id: number;
  payload: Dict | null;
  user_agent: string | null;
  client_addr: string | null;
  additional_ctx: Dict | null;
  created_at: string;
}
interface SubmissionPage {
  items: Submission[];
  total: number;
  page: number;
  page_size: number;
}

// A displayed column, resolved from either the payload, additional_ctx, or the
// fixed metadata fields. `mono` and `time` tune the cell rendering.
interface Column {
  id: string;
  label: string;
  get: (s: Submission) => unknown;
  mono?: boolean;
  time?: boolean;
}

/** "client_addr" → "Client addr", "email" → "Email". */
function humanize(key: string) {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Stable, first-seen-ordered union of a dict field's keys across rows. */
function unionKeys(rows: Submission[], pick: (s: Submission) => Dict | null) {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const dict = pick(row);
    if (!dict) continue;
    for (const k of Object.keys(dict)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

/** Flatten any cell value to a plain string for CSV / clipboard. */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export default function Leads() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'administrator';

  const [rows, setRows] = useState<Submission[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = (p: number) =>
    call<SubmissionPage>(
      // Cast: endpoint absent from the typed client until the backend adds it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.GET as any)('/api/submissions', {
        params: { query: { page: p, page_size: PAGE_SIZE } },
      }),
    );

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchPage(1)
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setTotal(res.total);
        setPage(1);
      })
      .catch(
        (e) =>
          !cancelled &&
          toast.error(isApiError(e) ? e.message : 'Could not load leads'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Columns: payload keys first, then additional_ctx keys, then the fixed meta
  // fields. user_agent is intentionally omitted for now. Derived from whatever
  // rows are loaded, so "Load more" can widen the grid.
  const columns = useMemo<Column[]>(() => {
    const payloadKeys = unionKeys(rows, (s) => s.payload);
    const ctxKeys = unionKeys(rows, (s) => s.additional_ctx);
    return [
      ...payloadKeys.map(
        (k): Column => ({
          id: `p:${k}`,
          label: humanize(k),
          get: (s) => s.payload?.[k],
        }),
      ),
      ...ctxKeys.map(
        (k): Column => ({
          id: `c:${k}`,
          label: humanize(k),
          get: (s) => s.additional_ctx?.[k],
        }),
      ),
      {
        id: 'client_addr',
        label: 'IP address',
        get: (s) => s.client_addr,
        mono: true,
      },
      { id: 'created_at', label: 'Submitted', get: (s) => s.created_at, time: true },
    ];
  }, [rows]);

  const hasMore = total !== null && rows.length < total;

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetchPage(next);
      setRows((prev) => [...prev, ...res.items]);
      setPage(next);
      setTotal(res.total);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not load more leads');
    } finally {
      setLoadingMore(false);
    }
  };

  // Serialize the loaded rows with the given delimiter. CSV quotes; TSV strips
  // tabs/newlines so a clipboard paste lands cleanly in a sheet.
  const serialize = (delim: string) => {
    const esc = (raw: string) => {
      if (delim === ',') {
        return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
      }
      return raw.replace(/[\t\n]/g, ' ');
    };
    const header = columns.map((c) => esc(c.label)).join(delim);
    const lines = rows.map((r) =>
      columns.map((c) => esc(cellText(c.get(r)))).join(delim),
    );
    return [header, ...lines].join('\n');
  };

  const exportCsv = () => {
    const blob = new Blob([serialize(',')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported leads.csv');
  };

  const openInSheets = () => {
    navigator.clipboard
      .writeText(serialize('\t'))
      .then(() =>
        toast.success('Leads copied to clipboard.', {
          description: 'Paste into the new sheet with ⌘V.',
        }),
      )
      .catch(() => {});
    window.open('https://sheets.new', '_blank', 'noopener,noreferrer');
  };

  // Admins only — bounce anyone who reaches the URL directly.
  if (!isAdmin) return <Navigate to="/" replace />;

  const empty = !loading && rows.length === 0;

  return (
    <Page width="full">
      <PageHeader
        title="Leads"
        description={
          total !== null
            ? `${total} ${total === 1 ? 'submission' : 'submissions'}`
            : 'Form submissions, newest first.'
        }
      />

      {/* Toolbar: filter/sort/search are presentational for now; export works. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <ToolButton icon={Funnel} label="Filter" />
          <ToolButton icon={ArrowsDownUp} label="Sort" />
          <ToolButton icon={MagnifyingGlass} label="Search" />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={empty}
          >
            <DownloadSimple size={15} weight="bold" /> Export as CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={openInSheets}
            disabled={empty}
          >
            <Table size={15} weight="bold" /> Open in Google Sheets
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState
          icon={Tray}
          title="No leads yet."
          hint="Submissions from your forms will show up here."
        />
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg-subtle">
                  <Th className="w-10 text-center text-fg-subtle">#</Th>
                  {columns.map((c) => (
                    <Th key={c.id}>{c.label}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-bg-subtle"
                  >
                    <Td className="text-center text-xs text-fg-subtle tnum">
                      {i + 1}
                    </Td>
                    {columns.map((c) => (
                      <Cell key={c.id} column={c} row={row} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? 'Loading…'
                  : `Load more (${total! - rows.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        'border-b border-r border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle whitespace-nowrap last:border-r-0',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'border-b border-r border-border px-3 py-2 whitespace-nowrap last:border-r-0',
        className,
      )}
    >
      {children}
    </td>
  );
}

function Cell({ column, row }: { column: Column; row: Submission }) {
  const value = column.get(row);

  if (column.time && typeof value === 'string') {
    return (
      <Td className="text-fg-muted tnum">
        <span title={fullTimestamp(value)}>{relativeTime(value)}</span>
      </Td>
    );
  }

  const text = cellText(value);
  if (text === '') {
    return <Td className="text-fg-subtle">—</Td>;
  }

  return (
    <Td className={cn('text-fg', column.mono && 'font-mono text-[13px]')}>
      {text}
    </Td>
  );
}

// Presentational toolbar control (filter/sort/search) — UI only for now.
function ToolButton({ icon: Icon, label }: { icon: Icon; label: string }) {
  return (
    <button
      type="button"
      title={`${label} — coming soon`}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 text-[13px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
    >
      <Icon size={15} weight="bold" />
      {label}
    </button>
  );
}
