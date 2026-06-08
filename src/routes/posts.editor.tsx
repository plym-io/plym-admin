import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowsClockwise,
  ArrowSquareOut,
  CloudCheck,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { usePostsStore } from '@/store/posts';
import { useAutosave } from '@/hooks/use-autosave';
import { useShortcut } from '@/hooks/use-shortcut';
import { slugify, relativeTime, hostname } from '@/lib/format';
import type { Post, PostStatus } from '@/types';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import { CoverWidget } from '@/components/editor/CoverWidget';
import { TagsInput } from '@/components/editor/TagsInput';
import { StatusPills } from '@/components/editor/StatusPills';
import { CanonicalField } from '@/components/editor/CanonicalField';
import { LinkSimple } from '@phosphor-icons/react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/classnames';

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover: string | null;
  canonical_url: string | null;
  tags: string[];
  status: PostStatus;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  cover: null,
  canonical_url: null,
  tags: [],
  status: 'draft',
};

/** True when a 422 names `canonical_url` (so we surface it inline at the field). */
function isCanonicalError(e: unknown): boolean {
  if (!isApiError(e)) return false;
  const detail = (e.raw as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    return detail.some(
      (d) =>
        typeof d === 'object' &&
        d !== null &&
        Array.isArray((d as { loc?: unknown[] }).loc) &&
        (d as { loc: unknown[] }).loc.includes('canonical_url'),
    );
  }
  return e.code.includes('canonical');
}

export default function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  // "new" is a sentinel route param so creating a post can swap to the real id
  // in place (no remount, no lost draft, working back button).
  const isNew = id === 'new';
  const postIdRef = useRef<number | null>(isNew ? null : Number(id));
  // Which post's data currently fills `draft` — lets us skip a redundant GET
  // right after create (when the id param flips from "new" to the real id).
  const hydratedIdRef = useRef<number | 'new' | null>(isNew ? 'new' : null);
  const upsertList = usePostsStore((s) => s.upsert);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [readingTime, setReadingTime] = useState(0);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [canonicalError, setCanonicalError] = useState<string | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Draft>(EMPTY);
  draftRef.current = draft;
  // Last canonical value known to be persisted, so we only auto-refresh the
  // rendered file when canonical_url actually changes (FOLLOWUP §refresh).
  const savedCanonicalRef = useRef<string | null>(isNew ? null : null);

  // Keep the title textarea sized to its content, including after load.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title]);

  // ---- load on id change --------------------------------------------
  useEffect(() => {
    if (id === 'new') {
      hydratedIdRef.current = 'new';
      return;
    }
    const numId = Number(id);
    if (Number.isNaN(numId)) {
      navigate('/posts', { replace: true });
      return;
    }
    // Already holding this post (e.g. we just created it) — don't refetch.
    if (hydratedIdRef.current === numId) return;

    let cancelled = false;
    setLoading(true);
    call(
      api.GET('/api/posts/{post_id}', {
        params: { path: { post_id: numId } },
      }),
    )
      .then((p) => {
        if (cancelled) return;
        postIdRef.current = numId;
        hydratedIdRef.current = numId;
        const next: Draft = {
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt ?? '',
          content: p.content,
          cover: p.cover ?? null,
          canonical_url: p.canonical_url ?? null,
          tags: (p.tags ?? []).map((t) => t.name),
          status: p.status,
        };
        draftRef.current = next;
        savedCanonicalRef.current = p.canonical_url ?? null;
        setDraft(next);
        setReadingTime(p.reading_time);
        setSlugTouched(true);
      })
      .catch((e) => {
        toast.error(isApiError(e) ? e.message : 'Could not load post');
        navigate('/posts');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // ---- persistence ---------------------------------------------------
  const persist = useCallback(
    async (payload: unknown) => {
      const d = payload as Draft;
      setSlugError(null);
      setCanonicalError(null);
      const effectiveSlug = d.slug || slugify(d.title);
      const canonicalChanged =
        (d.canonical_url ?? null) !== savedCanonicalRef.current;

      try {
        if (postIdRef.current === null) {
          // Create on first meaningful keystroke.
          if (!d.title.trim()) return;
          const created = await call(
            api.POST('/api/posts', {
              body: {
                title: d.title,
                slug: effectiveSlug,
                content: d.content,
                excerpt: d.excerpt || null,
                cover: d.cover,
                canonical_url: d.canonical_url,
                tags: d.tags,
              },
            }),
          );
          postIdRef.current = created.id;
          hydratedIdRef.current = created.id; // we already hold this post's data
          savedCanonicalRef.current = created.canonical_url ?? null;
          setReadingTime(created.reading_time);
          syncList(created);
          // Swap /posts/new → /posts/:id in place. Same route, so the editor
          // keeps its state (and the back button stays sane).
          navigate(`/posts/${created.id}`, { replace: true });
        } else {
          const updated = await call(
            api.PATCH('/api/posts/{post_id}', {
              params: { path: { post_id: postIdRef.current } },
              body: {
                title: d.title,
                content: d.content,
                excerpt: d.excerpt || null,
                cover: d.cover,
                // null explicitly clears it; a string sets it.
                canonical_url: d.canonical_url,
                tags: d.tags,
              },
            }),
          );
          savedCanonicalRef.current = updated.canonical_url ?? null;
          setReadingTime(updated.reading_time);
          syncList(updated);

          // Auto-refresh the rendered file when the canonical URL changed, so
          // <link rel="canonical"> on disk stays in step (FOLLOWUP §refresh).
          if (canonicalChanged) {
            await call(
              api.POST('/api/posts/{post_id}/refresh', {
                params: { path: { post_id: postIdRef.current } },
              }),
            ).catch(() => {});
          }
        }
      } catch (e) {
        if (isApiError(e) && e.code.includes('slug')) {
          setSlugError(e.message);
          throw e;
        }
        if (isCanonicalError(e)) {
          setCanonicalError((e as { message: string }).message);
          throw e;
        }
        toast.error(isApiError(e) ? e.message : 'Autosave failed');
        throw e;
      }
    },
    [navigate],
  );

  const syncList = (p: Post) =>
    upsertList({
      created_at: p.created_at,
      updated_at: p.updated_at,
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      reading_time: p.reading_time,
      excerpt: p.excerpt,
      cover: p.cover,
      canonical_url: p.canonical_url,
      published_at: p.published_at,
      author: p.author,
      tags: p.tags,
    });

  const autosave = useAutosave(persist, 1000);

  // Schedule a save whenever content-ish fields change.
  const update = useCallback(
    (patch: Partial<Draft>) => {
      const next = { ...draftRef.current, ...patch };
      // Keep slug in lockstep with the title until the user edits it.
      if (patch.title !== undefined && !slugTouched) {
        next.slug = slugify(patch.title);
      }
      draftRef.current = next;
      setDraft(next);
      autosave.schedule(next);
    },
    [autosave, slugTouched],
  );

  // ---- slug (its own endpoint behavior via PATCH not supported; uses create) -
  // Slug isn't in PostUpdate, so it's only settable at create time. We keep the
  // field editable to derive the create slug and to show conflicts inline.

  // ---- status / publish ---------------------------------------------
  const setStatus = useCallback(
    async (status: PostStatus) => {
      const prev = draft.status;
      setDraft((d) => ({ ...d, status })); // optimistic
      if (postIdRef.current === null) return;
      setStatusPending(true);
      try {
        const updated = await call(
          api.PATCH('/api/posts/{post_id}', {
            params: { path: { post_id: postIdRef.current } },
            body: { status },
          }),
        );
        syncList(updated);
        await call(
          api.POST('/api/posts/{post_id}/refresh', {
            params: { path: { post_id: postIdRef.current } },
          }),
        ).catch(() => {});
        toast.success(
          status === 'published'
            ? 'Live. The rendered file is up to date.'
            : `Moved to ${status}.`,
        );
      } catch (e) {
        setDraft((d) => ({ ...d, status: prev }));
        toast.error(isApiError(e) ? e.message : 'Could not change status');
      } finally {
        setStatusPending(false);
      }
    },
    [draft.status],
  );

  // ---- explicit save (⌘S) — flush autosave then refresh rendered file -
  const saveAndRefresh = useCallback(async () => {
    autosave.flush();
    // Give the flush a tick to set the id on first save.
    await new Promise((r) => setTimeout(r, 50));
    if (postIdRef.current === null) {
      toast.message('Add a title to start saving.');
      return;
    }
    try {
      await call(
        api.POST('/api/posts/{post_id}/refresh', {
          params: { path: { post_id: postIdRef.current } },
        }),
      );
      toast.success('Rendered file refreshed.');
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Refresh failed');
    }
  }, [autosave]);

  // ---- preview (opens an isolated about:blank tab) -------------------
  const openPreview = useCallback(() => {
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      toast.error('Allow pop-ups to preview this post.');
      return;
    }
    const loadingDoc =
      '<!doctype html><meta charset="utf-8"><title>Preview…</title>' +
      '<body style="margin:0;height:100vh;display:grid;place-items:center;' +
      'font-family:system-ui,sans-serif;color:#9a9a9a">Rendering preview…</body>';
    tab.document.write(loadingDoc);
    tab.document.close();

    const d = draftRef.current;
    call(
      api.POST('/api/posts/preview', {
        body: {
          title: d.title || 'Untitled',
          content: d.content,
          excerpt: d.excerpt || null,
          cover: d.cover,
          canonical_url: d.canonical_url,
        },
      }),
    )
      .then((res) => {
        // Full document from plym — written into its own tab, fully isolated
        // from the admin's styles.
        tab.document.open();
        tab.document.write(res.html);
        tab.document.close();
      })
      .catch((e) => {
        tab.document.body.innerHTML =
          '<p style="font-family:system-ui;color:#c4321a;padding:2rem">Preview failed: ' +
          (isApiError(e) ? e.message : 'unknown error') +
          '</p>';
      });
  }, []);

  useShortcut('mod+s', () => void saveAndRefresh(), { allowInInput: true });
  useShortcut(
    'mod+enter',
    () => void setStatus(draft.status === 'published' ? 'draft' : 'published'),
    { allowInInput: true },
  );
  useShortcut('mod+/', () => openPreview(), { allowInInput: true });

  if (loading) return <EditorSkeleton />;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          onClick={() => navigate('/posts')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <ArrowLeft size={16} /> Posts
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-fg-subtle">
          <span className="shrink-0">Slug:</span>
          <input
            value={draft.slug}
            disabled={!isNew && postIdRef.current !== null}
            onChange={(e) => {
              setSlugTouched(true);
              setDraft((d) => ({ ...d, slug: slugify(e.target.value) }));
            }}
            title={!isNew ? 'Slug is fixed after creation' : 'Edit the slug'}
            className={cn(
              'rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[13px] text-fg-muted outline-none transition-colors',
              isNew && 'hover:border-border focus:border-accent',
              slugError && 'border-danger text-danger',
              !isNew && 'cursor-default opacity-70',
            )}
          />
          {draft.slug && (
            <button
              type="button"
              onClick={() =>
                window.open(`/blog/${draft.slug}`, '_blank', 'noopener')
              }
              title="Open post in a new tab"
              aria-label="Open post in a new tab"
              className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <ArrowSquareOut size={14} />
            </button>
          )}

          {/* Active canonical override — click the host to jump to the field. */}
          {draft.canonical_url && (
            <>
              <span className="shrink-0 text-border-strong">·</span>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('canonical-field')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                title={`Canonical URL: ${draft.canonical_url}`}
                className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-fg-muted transition-colors hover:text-fg"
              >
                <LinkSimple size={13} className="shrink-0 text-accent" />
                <span className="truncate font-mono text-[13px]">
                  {hostname(draft.canonical_url)}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open(draft.canonical_url!, '_blank', 'noopener')
                }
                title="Open canonical URL in a new tab"
                aria-label="Open canonical URL in a new tab"
                className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <ArrowSquareOut size={14} />
              </button>
            </>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={openPreview}
            title="Open preview in a new tab"
          >
            <ArrowSquareOut size={16} /> Preview
            <Kbd keys="mod+/" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void saveAndRefresh()}>
            <ArrowsClockwise size={15} /> Save
            <Kbd keys="mod+s" />
          </Button>
        </div>
      </div>
      {slugError && (
        <p className="border-b border-border bg-danger/5 px-4 py-1.5 text-xs text-danger">
          {slugError}
        </p>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Center column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-3xl px-8 pt-8">
            <textarea
              ref={titleRef}
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Title"
              rows={1}
              className="w-full resize-none bg-transparent font-serif text-4xl font-bold leading-tight tracking-tight outline-none placeholder:text-fg-subtle/50"
            />
            <input
              value={draft.excerpt}
              onChange={(e) => update({ excerpt: e.target.value })}
              placeholder="Add a one-line excerpt…"
              className="mt-3 w-full bg-transparent text-[15px] text-fg-muted outline-none placeholder:text-fg-subtle/60"
            />
          </div>

          <div className="mt-4 flex min-h-0 flex-1 border-t border-border">
            <div className="mx-auto w-full max-w-3xl min-w-0 overflow-hidden px-8">
              <MarkdownEditor
                value={draft.content}
                onChange={(content) => update({ content })}
                editorRef={cmRef}
              />
            </div>
          </div>

          <SaveLine state={autosave.state} savedAt={autosave.savedAt} />
        </div>

        {/* Right rail */}
        <aside className="hidden w-72 shrink-0 space-y-6 overflow-y-auto border-l border-border bg-bg-subtle p-5 lg:block">
          <CoverWidget
            cover={draft.cover}
            onChange={(url) => update({ cover: url })}
          />
          <StatusPills
            status={draft.status}
            pending={statusPending}
            onChange={(s) => void setStatus(s)}
          />
          <TagsInput tags={draft.tags} onChange={(tags) => update({ tags })} />
          <CanonicalField
            value={draft.canonical_url}
            serverError={canonicalError}
            onEdit={() => canonicalError && setCanonicalError(null)}
            onCommit={(url) => {
              update({ canonical_url: url });
              autosave.flush();
            }}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Reading time
            </p>
            <p className="text-2xl font-semibold text-fg tnum">
              <AnimatedNumber value={readingTime} />
              <span className="ml-1 text-sm font-normal text-fg-muted">
                min
              </span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SaveLine({
  state,
  savedAt,
}: {
  state: ReturnType<typeof useAutosave>['state'];
  savedAt: Date | null;
}) {
  // Re-render every 5s so "Saved Ns ago" stays honest.
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(i);
  }, []);
  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'error'
        ? 'Save failed — retrying on next change'
        : savedAt
          ? `Saved ${relativeTime(savedAt)}`
          : 'Draft autosaves as you type';
  return (
    <div
      aria-live="polite"
      className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-8 text-xs text-fg-subtle"
    >
      <motion.span
        key={state}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-1.5"
      >
        {state === 'saving' && (
          <ArrowsClockwise size={12} className="animate-spin" />
        )}
        {state === 'saved' && <CloudCheck size={13} className="text-success" />}
        {label}
      </motion.span>
      <span className="ml-auto">
        Press <Kbd keys="mod+s" /> to refresh the rendered file
      </span>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-12 border-b border-border" />
      <div className="mx-auto w-full max-w-3xl space-y-4 px-8 pt-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="space-y-2 pt-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
