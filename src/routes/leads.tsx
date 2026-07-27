import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import {
  Funnel,
  ArrowsDownUp,
  MagnifyingGlass,
  DownloadSimple,
  Table,
  Tray,
  ArrowUp,
  ArrowDown,
  type Icon,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { Submission } from '@/types';
import { useAuthStore } from '@/store/auth';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeTime, fullTimestamp } from '@/lib/format';
import { cn } from '@/lib/classnames';

const PAGE_SIZE = 20;

/** Free-form JSON bag — both `payload` and `additional_ctx` are untyped server-side. */
type Dict = Record<string, unknown>;

// A displayed column, resolved from either the payload, additional_ctx, or the
// fixed metadata fields. `mono` and `time` tune the cell rendering.
interface Column {
  id: string;
  label: string;
  get: (s: Submission) => unknown;
  mono?: boolean;
  time?: boolean;
}

type SortState = { colId: string; dir: 'asc' | 'desc' } | null;

/** "client_addr" → "Client addr", "email" → "Email". */
function humanize(key: string) {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Stable, first-seen-ordered union of a dict field's keys across rows. */
function unionKeys(
  rows: Submission[],
  // `additional_ctx` is optional in the schema, so `pick` may yield undefined.
  pick: (s: Submission) => Dict | null | undefined,
) {
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

/** Flatten any cell value to a plain string for CSV / clipboard / matching. */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Compare two non-empty cell values; numeric/date aware, else lexical. */
function compareValues(a: unknown, b: unknown, time: boolean): number {
  if (time) {
    return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = cellText(a);
  const sb = cellText(b);
  const na = Number(sa);
  const nb = Number(sb);
  if (sa.trim() && sb.trim() && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return na - nb;
  }
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

/** Copy text to the clipboard, with a legacy fallback for insecure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function Leads() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'administrator';

  const [rows, setRows] = useState<Submission[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Client-side view controls (operate on the rows loaded so far).
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const searchRef = useDismiss(searchOpen, () => setSearchOpen(false));
  const sortRef = useDismiss(sortOpen, () => setSortOpen(false));
  const filterRef = useDismiss(filterOpen, () => setFilterOpen(false));

  const fetchPage = (p: number) =>
    call(
      api.GET('/api/submissions', {
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

  const columnsById = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c])),
    [columns],
  );

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, v]) => v.trim() !== ''),
    [filters],
  );

  // Apply filters → search → sort to the loaded rows.
  const view = useMemo(() => {
    let out = rows;

    if (activeFilters.length) {
      out = out.filter((r) =>
        activeFilters.every(([colId, q]) => {
          const col = columnsById[colId];
          if (!col) return true;
          return cellText(col.get(r)).toLowerCase().includes(q.trim().toLowerCase());
        }),
      );
    }

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        columns.some((c) => cellText(c.get(r)).toLowerCase().includes(q)),
      );
    }

    if (sort) {
      const col = columnsById[sort.colId];
      if (col) {
        const factor = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.get(a);
          const bv = col.get(b);
          const aEmpty = av == null || av === '';
          const bEmpty = bv == null || bv === '';
          if (aEmpty || bEmpty) {
            if (aEmpty && bEmpty) return 0;
            return aEmpty ? 1 : -1; // empties always sort last
          }
          return factor * compareValues(av, bv, !!col.time);
        });
      }
    }

    return out;
  }, [rows, columns, columnsById, activeFilters, search, sort]);

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

  // Click a header (or a Sort-menu row) to cycle: asc → desc → unsorted.
  const toggleSort = (colId: string) => {
    setSort((prev) => {
      if (prev?.colId !== colId) return { colId, dir: 'asc' };
      if (prev.dir === 'asc') return { colId, dir: 'desc' };
      return null;
    });
  };

  // Serialize the current view with the given delimiter. CSV quotes; TSV strips
  // tabs/newlines so a clipboard paste lands cleanly in a sheet.
  const serialize = (delim: string) => {
    const esc = (raw: string) => {
      if (delim === ',') {
        return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
      }
      return raw.replace(/[\t\n]/g, ' ');
    };
    const header = columns.map((c) => esc(c.label)).join(delim);
    const lines = view.map((r) =>
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
    // Open first (synchronous, tied to the click) so it's never popup-blocked.
    const win = window.open('https://sheets.new', '_blank');
    if (win) win.opener = null;
    void copyText(serialize('\t')).then((ok) => {
      if (ok) {
        toast.success('Leads copied to clipboard.', {
          description: 'Paste into the new sheet with ⌘V.',
        });
      } else {
        toast.info('Opened Google Sheets.', {
          description: 'Copy was blocked here — use Export as CSV, then File → Import.',
        });
      }
    });
  };

  // Admins only — bounce anyone who reaches the URL directly.
  if (!isAdmin) return <Navigate to="/" replace />;

  const noData = !loading && rows.length === 0;
  const noMatches = !loading && rows.length > 0 && view.length === 0;

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

      {/* Toolbar: filter / sort / search act on the loaded rows; export works. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <div className="relative" ref={filterRef}>
            <ToolButton
              icon={Funnel}
              label="Filter"
              count={activeFilters.length}
              active={filterOpen || activeFilters.length > 0}
              onClick={() => setFilterOpen((o) => !o)}
            />
            {filterOpen && (
              <Popover className="w-64">
                <div className="max-h-72 space-y-2 overflow-y-auto p-2">
                  {columns.map((c) => (
                    <label key={c.id} className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                        {c.label}
                      </span>
                      <input
                        value={filters[c.id] ?? ''}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [c.id]: e.target.value }))
                        }
                        placeholder="Contains…"
                        className="h-7 w-full rounded border border-border bg-bg-subtle px-2 text-[13px] outline-none transition-colors hover:border-border-strong focus:border-accent"
                      />
                    </label>
                  ))}
                </div>
                {activeFilters.length > 0 && (
                  <PopoverFooter onClick={() => setFilters({})}>
                    Clear all filters
                  </PopoverFooter>
                )}
              </Popover>
            )}
          </div>

          <div className="relative" ref={sortRef}>
            <ToolButton
              icon={ArrowsDownUp}
              label="Sort"
              active={sortOpen || sort !== null}
              onClick={() => setSortOpen((o) => !o)}
            />
            {sortOpen && (
              <Popover className="w-52">
                <div className="p-1">
                  {columns.map((c) => {
                    const dir = sort?.colId === c.id ? sort.dir : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                      >
                        <span className="truncate">{c.label}</span>
                        {dir === 'asc' && (
                          <ArrowUp size={13} weight="bold" className="text-accent" />
                        )}
                        {dir === 'desc' && (
                          <ArrowDown size={13} weight="bold" className="text-accent" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {sort && (
                  <PopoverFooter onClick={() => setSort(null)}>
                    Clear sort
                  </PopoverFooter>
                )}
              </Popover>
            )}
          </div>

          <div className="relative" ref={searchRef}>
            <ToolButton
              icon={MagnifyingGlass}
              label="Search"
              active={searchOpen || search.trim() !== ''}
              onClick={() => setSearchOpen((o) => !o)}
            />
            {searchOpen && (
              <Popover className="w-64">
                <div className="p-2">
                  <div className="relative">
                    <MagnifyingGlass
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
                    />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search all columns…"
                      className="h-8 w-full rounded-md border border-border bg-bg-subtle pl-8 pr-2 text-sm outline-none transition-colors hover:border-border-strong focus:border-accent"
                    />
                  </div>
                </div>
              </Popover>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={view.length === 0}
          >
            <DownloadSimple size={15} weight="bold" /> Export as CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={openInSheets}
            disabled={view.length === 0}
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
      ) : noData ? (
        <EmptyState
          icon={Tray}
          title="No leads yet."
          hint="Submissions from your forms will show up here."
        />
      ) : noMatches ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="No leads match."
          hint="Try a different search or clear your filters."
        />
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg-subtle">
                  <Th className="w-10 text-center text-fg-subtle">#</Th>
                  {columns.map((c) => {
                    const dir = sort?.colId === c.id ? sort.dir : null;
                    return (
                      <th
                        key={c.id}
                        onClick={() => toggleSort(c.id)}
                        title={`Sort by ${c.label}`}
                        className="cursor-pointer select-none border-b border-r border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-colors last:border-r-0 hover:text-fg"
                      >
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            dir ? 'text-fg' : 'text-fg-subtle',
                          )}
                        >
                          {c.label}
                          {dir === 'asc' && (
                            <ArrowUp size={12} weight="bold" className="text-accent" />
                          )}
                          {dir === 'desc' && (
                            <ArrowDown size={12} weight="bold" className="text-accent" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.map((row, i) => (
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

/** Close-on-outside-click / Escape for a popover. Returns the wrapper ref. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return ref;
}

function Popover({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'absolute left-0 top-full z-20 mt-1.5 rounded-lg border border-border bg-bg shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

function PopoverFooter({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="border-t border-border p-1">
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
      >
        {children}
      </button>
    </div>
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
        'border-b border-r border-border px-3 py-2 align-top whitespace-nowrap last:border-r-0',
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

  // Cap wide values at a fixed width and wrap, rather than letting one long
  // cell stretch the column until the table overflows. The width lives on an
  // inner div so it's honored under the table's auto layout.
  return (
    <Td className={cn('text-fg', column.mono && 'font-mono text-[13px]')}>
      <div className="max-w-[360px] break-words whitespace-normal">{text}</div>
    </Td>
  );
}

// Toolbar control that toggles a popover. Shows an active state and an optional
// count badge (used by Filter).
function ToolButton({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: Icon;
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors',
        active
          ? 'border-accent/40 bg-accent-soft text-accent'
          : 'border-border bg-bg-subtle text-fg-muted hover:bg-bg-muted hover:text-fg',
      )}
    >
      <Icon size={15} weight="bold" />
      {label}
      {count != null && count > 0 && (
        <span className="ml-0.5 rounded-pill bg-accent px-1.5 text-[11px] font-semibold text-white tnum">
          {count}
        </span>
      )}
    </button>
  );
}
