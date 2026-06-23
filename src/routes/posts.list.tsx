import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, LayoutGroup } from 'motion/react';
import { toast } from 'sonner';
import { MagnifyingGlass, PencilSimpleLine, Article, Plus } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { usePostsStore } from '@/store/posts';
import { useDebouncedValue } from '@/hooks/use-debounced';
import type { PostListItem, PostStatus } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { PostRow } from '@/components/posts/PostRow';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/classnames';

const PAGE_SIZE = 20;

type Filter = 'all' | PostStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

// Published first, then draft, then archived; newest updated within each.
const STATUS_RANK: Record<PostStatus, number> = {
  published: 0,
  draft: 1,
  archived: 2,
};
function sortPosts(a: PostListItem, b: PostListItem) {
  if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  return +new Date(b.updated_at) - +new Date(a.updated_at);
}

export default function PostsList() {
  const navigate = useNavigate();
  const { list, loaded, setList, append, patch, remove, upsert } = usePostsStore();
  const [loading, setLoading] = useState(!loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  // Items fetched from the server so far for the active filter/search. Tracked
  // separately from `list.length` so optimistic add/remove can't skew "has more".
  const [loadedCount, setLoadedCount] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  // Same query params for the initial page and "load more", minus `page`.
  const queryFor = (p: number) => ({
    include_drafts: true,
    page: p,
    page_size: PAGE_SIZE,
    ...(filter !== 'all' && { status: filter }),
    ...(debouncedQuery && { search: debouncedQuery }),
  });

  // Server-side scope (BRD FOLLOWUP §1.4): drafts included, status pills map to
  // `status`, the search box maps to `search`. Refetch when either changes.
  useEffect(() => {
    let cancelled = false;
    if (!loaded) setLoading(true);
    call(api.GET('/api/posts', { params: { query: queryFor(1) } }))
      .then((p) => {
        if (cancelled) return;
        setList(p.items);
        setTotal(p.total);
        setPage(1);
        setLoadedCount(p.items.length);
      })
      .catch(
        (e) =>
          !cancelled &&
          toast.error(isApiError(e) ? e.message : 'Could not load posts'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedQuery]);

  // Server already filtered + ordered by updated_at; we re-group by status so
  // published rises above drafts in the "All" view (BRD §6.3).
  const visible = useMemo(() => [...list].sort(sortPosts), [list]);

  const hasMore = total !== null && loadedCount < total;

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const p = await call(api.GET('/api/posts', { params: { query: queryFor(next) } }));
      append(p.items);
      setPage(next);
      setLoadedCount((c) => c + p.items.length);
      setTotal(p.total);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not load more posts');
    } finally {
      setLoadingMore(false);
    }
  };

  const togglePublish = async (post: PostListItem) => {
    const next: PostStatus = post.status === 'published' ? 'draft' : 'published';
    const prev = post.status;
    patch(post.id, { status: next, updated_at: new Date().toISOString() }); // optimistic
    try {
      await call(
        api.PATCH('/api/posts/{post_id}', {
          params: { path: { post_id: post.id } },
          body: { status: next },
        }),
      );
      // Keep the rendered file in step with the new status.
      await call(
        api.POST('/api/posts/{post_id}/refresh', {
          params: { path: { post_id: post.id } },
        }),
      ).catch(() => {});
      toast.success(next === 'published' ? 'Published.' : 'Moved to draft.');
    } catch (e) {
      patch(post.id, { status: prev });
      toast.error(isApiError(e) ? e.message : 'Could not update status', {
        action: { label: 'Retry', onClick: () => togglePublish(post) },
      });
    }
  };

  const refresh = async (post: PostListItem) => {
    try {
      await call(
        api.POST('/api/posts/{post_id}/refresh', {
          params: { path: { post_id: post.id } },
        }),
      );
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Refresh failed');
    }
  };

  const del = (post: PostListItem) => {
    remove(post.id); // optimistic collapse
    let undone = false;
    toast(`Deleted "${post.title}"`, {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true;
          upsert(post);
        },
      },
      onAutoClose: () => {
        if (undone) return;
        void call(
          api.DELETE('/api/posts/{post_id}', {
            params: { path: { post_id: post.id } },
          }),
        ).catch((e) => {
          upsert(post); // restore on failure
          toast.error(isApiError(e) ? e.message : 'Delete failed');
        });
      },
    });
  };

  return (
    <Page width="wide">
      <PageHeader
        title="Posts"
        description={
          total !== null
            ? `${total} ${total === 1 ? 'post' : 'posts'}${
                filter !== 'all' || debouncedQuery ? ' match' : ''
              }`
            : undefined
        }
        actions={
          <Button variant="accent" onClick={() => navigate('/posts/new')}>
            <Plus size={16} weight="bold" /> New post
          </Button>
        }
      />

      {/* Search + filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts…"
            className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md bg-bg-muted p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                filter === f.value
                  ? 'bg-bg text-fg shadow-xs'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          filter === 'all' && !debouncedQuery ? (
            <EmptyState
              icon={Article}
              title="Nothing here yet. Start writing."
              hint="Your first post is one keystroke away."
              action={
                <button
                  onClick={() => navigate('/posts/new')}
                  className="inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-fg/90"
                >
                  <PencilSimpleLine size={16} /> New post
                  <Kbd keys="mod+n" className="border-white/20 bg-white/10 text-white/80" />
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={MagnifyingGlass}
              title="No matches."
              hint="Try a different search or filter."
            />
          )
        ) : (
          <LayoutGroup>
            <div className="flex flex-col">
              <AnimatePresence initial={false}>
                {visible.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onTogglePublish={togglePublish}
                    onRefresh={refresh}
                    onDelete={del}
                  />
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        )}

        {!loading && hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Load more (${total! - loadedCount} left)`}
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
