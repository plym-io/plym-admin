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
  CornersIn,
  CornersOut,
  MarkdownLogo,
  TextAa,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { liveUrl } from '@/lib/base';
import { isApiError } from '@/api/errors';
import { usePostsStore } from '@/store/posts';
import { useUiStore } from '@/store/ui';
import { useAutosave } from '@/hooks/use-autosave';
import { useShortcut } from '@/hooks/use-shortcut';
import { slugify, relativeTime, hostname } from '@/lib/format';
import type { Faq, Post, PostStatus } from '@/types';
import { MarkdownEditor, type EditorMode } from '@/components/editor/MarkdownEditor';
import { CoverWidget } from '@/components/editor/CoverWidget';
import { TagsInput } from '@/components/editor/TagsInput';
import { CategoryField } from '@/components/editor/CategoryField';
import { FaqSection } from '@/components/editor/FaqSection';
import { StatusPills } from '@/components/editor/StatusPills';
import { CanonicalField } from '@/components/editor/CanonicalField';
import { PublishDateField } from '@/components/editor/PublishDateField';
import { LinkSimple } from '@phosphor-icons/react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/classnames';

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover: string | null;
  canonical_url: string | null;
  tags: string[];
  faqs: Faq[];
  status: PostStatus;
  category_id: number | null;
  weight: number | null;
  published_at: string | null;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  cover: null,
  canonical_url: null,
  tags: [],
  faqs: [],
  status: 'draft',
  category_id: null,
  weight: null,
  published_at: null,
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
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);
  const editorMode = useUiStore((s) => s.editorMode);
  const toggleEditorMode = useUiStore((s) => s.toggleEditorMode);

  // Focus mode belongs to the editor, not to the app — leaving here restores
  // the chrome, so you can never get stranded in a chromeless Settings page.
  useEffect(() => () => setFocusMode(false), [setFocusMode]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [readingTime, setReadingTime] = useState(0);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [canonicalError, setCanonicalError] = useState<string | null>(null);
  // Server-rendered location of the post ("<category>/<slug>"), straight from
  // the API. Only what has been persisted actually exists on the site, so this
  // tracks save responses rather than the draft.
  const [livePath, setLivePath] = useState<string | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<Draft>(EMPTY);
  draftRef.current = draft;
  // Last canonical value known to be persisted, so we only auto-refresh the
  // rendered file when canonical_url actually changes (FOLLOWUP §refresh).
  const savedCanonicalRef = useRef<string | null>(isNew ? null : null);
  // Last slug known to be persisted — changing it moves the post's URL, so we
  // re-render the file when it changes (mirrors the canonical refresh).
  const savedSlugRef = useRef<string | null>(null);
  // The category prefixes the post's path (e.g. "hiring-bias/my-post"), so
  // moving a post between categories relocates its URL — refresh like a slug.
  const savedCategoryRef = useRef<number | null>(null);
  // Last publish date known to be persisted. This is the one post field the
  // server moves on its own — the publish trigger stamps it — so we send it
  // only when the author actually changed it, and never on the strength of an
  // autosave snapshot taken before that stamp landed.
  const savedPublishedAtRef = useRef<string | null>(null);

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
          faqs: p.faqs ?? [],
          status: p.status,
          category_id: p.category?.id ?? null,
          weight: p.weight ?? null,
          published_at: p.published_at ?? null,
        };
        draftRef.current = next;
        savedCanonicalRef.current = p.canonical_url ?? null;
        savedSlugRef.current = p.slug;
        savedCategoryRef.current = p.category?.id ?? null;
        savedPublishedAtRef.current = p.published_at ?? null;
        setDraft(next);
        setReadingTime(p.reading_time);
        setLivePath(p.path);
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
  // Every response is authoritative for `published_at` — the trigger stamps it
  // when a post first goes live. Folding the value back in keeps the field
  // showing the real date and stops the next save from arguing with it.
  const adoptPublishedAt = useCallback((value: string | null) => {
    savedPublishedAtRef.current = value;
    if (draftRef.current.published_at === value) return;
    const merged = { ...draftRef.current, published_at: value };
    draftRef.current = merged;
    setDraft(merged);
  }, []);

  const persist = useCallback(
    async (payload: unknown) => {
      const d = payload as Draft;
      setSlugError(null);
      setCanonicalError(null);
      const effectiveSlug = d.slug || slugify(d.title);
      // A blank title or slug is never valid server-side (422) — skip the
      // request instead of round-tripping a save we know will fail.
      if (!d.title.trim() || !effectiveSlug.trim()) return;
      const canonicalChanged =
        (d.canonical_url ?? null) !== savedCanonicalRef.current;
      const slugChanged = effectiveSlug !== savedSlugRef.current;
      const categoryChanged = (d.category_id ?? null) !== savedCategoryRef.current;
      // Read live rather than from this save's snapshot: publishing between the
      // keystroke and the debounce firing would otherwise send the null the
      // draft carried before the trigger stamped a date, erasing it. Omitted
      // entirely when unchanged, so the server's own value stands.
      const publishedAt = draftRef.current.published_at;
      const publishedAtChanged = publishedAt !== savedPublishedAtRef.current;

      try {
        if (postIdRef.current === null) {
          // Create on first meaningful keystroke.
          const created = await call(
            api.POST('/api/posts', {
              // `faqs` goes out as a list of FAQ ids; the API returns full objects.
              body: {
                title: d.title,
                slug: effectiveSlug,
                content: d.content,
                excerpt: d.excerpt || null,
                cover: d.cover,
                canonical_url: d.canonical_url,
                category_id: d.category_id,
                weight: d.weight,
                ...(publishedAtChanged ? { published_at: publishedAt } : {}),
                tags: d.tags,
                faqs: d.faqs.map((f) => f.id),
              },
            }),
          );
          postIdRef.current = created.id;
          hydratedIdRef.current = created.id; // we already hold this post's data
          savedCanonicalRef.current = created.canonical_url ?? null;
          savedSlugRef.current = created.slug;
          savedCategoryRef.current = created.category?.id ?? null;
          adoptPublishedAt(created.published_at ?? null);
          setReadingTime(created.reading_time);
          setLivePath(created.path);
          syncList(created);
          // Swap /posts/new → /posts/:id in place. Same route, so the editor
          // keeps its state (and the back button stays sane).
          navigate(`/posts/${created.id}`, { replace: true });
        } else {
          const updated = await call(
            api.PATCH('/api/posts/{post_id}', {
              params: { path: { post_id: postIdRef.current } },
              // `faqs` is a list of FAQ ids on the way in.
              body: {
                title: d.title,
                slug: effectiveSlug,
                content: d.content,
                excerpt: d.excerpt || null,
                cover: d.cover,
                // null explicitly clears it; a string sets it.
                canonical_url: d.canonical_url,
                category_id: d.category_id,
                weight: d.weight,
                ...(publishedAtChanged ? { published_at: publishedAt } : {}),
                tags: d.tags,
                faqs: d.faqs.map((f) => f.id),
              },
            }),
          );
          savedCanonicalRef.current = updated.canonical_url ?? null;
          savedSlugRef.current = updated.slug;
          savedCategoryRef.current = updated.category?.id ?? null;
          adoptPublishedAt(updated.published_at ?? null);
          setReadingTime(updated.reading_time);
          setLivePath(updated.path);
          syncList(updated);

          // Auto-refresh the rendered file when the canonical URL, slug, or
          // category changed — each moves the post's URL, so the file on disk
          // would otherwise go stale (FOLLOWUP §refresh).
          if (canonicalChanged || slugChanged || categoryChanged) {
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
    [navigate, adoptPublishedAt],
  );

  const syncList = (p: Post) =>
    upsertList({
      created_at: p.created_at,
      updated_at: p.updated_at,
      id: p.id,
      slug: p.slug,
      path: p.path,
      title: p.title,
      status: p.status,
      reading_time: p.reading_time,
      excerpt: p.excerpt,
      cover: p.cover,
      canonical_url: p.canonical_url,
      weight: p.weight,
      published_at: p.published_at,
      author: p.author,
      category: p.category,
      tags: p.tags,
    });

  const autosave = useAutosave(persist, 1000);

  // ---- autosave toggle ------------------------------------------------
  // On for a draft, off for a published post: autosaving a draft loses
  // nothing, autosaving a published post ships every half-typed sentence to
  // readers. The default follows the status; the switch is the override.
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const schedule = autosave.schedule;
  const setAutosave = useCallback(
    (on: boolean) => {
      setAutosaveOn(on);
      // Edits made while it was off are picked up the moment it comes back.
      if (on && dirtyRef.current) {
        schedule(draftRef.current);
        setDirty(false);
      }
    },
    // `schedule` is the hook's stable callback — the autosave object itself
    // is fresh every render and would re-arm the status effect below.
    [schedule],
  );

  useEffect(() => {
    setAutosave(draft.status === 'draft');
  }, [draft.status, setAutosave]);

  // With autosave off, closing the tab is the one way to lose work — warn.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
      if (autosaveOn) autosave.schedule(next);
      else setDirty(true);
    },
    [autosave, autosaveOn, slugTouched],
  );

  // ---- slug ----------------------------------------------------------
  // Editable at any time: on create it seeds PostCreate.slug; on an existing
  // post an edit is sent via PATCH (see persist). Conflicts surface inline.

  // ---- status / publish ---------------------------------------------
  const setStatus = useCallback(
    async (status: PostStatus) => {
      const prev = draft.status;
      setDraft((d) => ({ ...d, status })); // optimistic
      if (postIdRef.current === null) return;
      setStatusPending(true);
      try {
        // Publish what is on screen: edits made with autosave off are saved
        // first, and a debounce still in flight is flushed. An untouched
        // post sends nothing extra.
        if (dirtyRef.current) {
          await autosave.saveNow(draftRef.current);
          setDirty(false);
        } else {
          autosave.flush();
        }
        const updated = await call(
          api.PATCH('/api/posts/{post_id}', {
            params: { path: { post_id: postIdRef.current } },
            body: { status },
          }),
        );
        setLivePath(updated.path);
        syncList(updated);
        // Publishing is where the trigger stamps a date on a post that had
        // none — take it now, or the next autosave would offer the null the
        // draft still holds and undo it.
        adoptPublishedAt(updated.published_at ?? null);
        await call(
          api.POST('/api/posts/{post_id}/refresh', {
            params: { path: { post_id: postIdRef.current } },
          }),
        ).catch(() => {});
        toast.success(
          status === 'published'
            ? 'Published.'
            : `Moved to ${status}.`,
        );
      } catch (e) {
        setDraft((d) => ({ ...d, status: prev }));
        toast.error(isApiError(e) ? e.message : 'Could not change status');
      } finally {
        setStatusPending(false);
      }
    },
    [draft.status, adoptPublishedAt, autosave],
  );

  // ---- explicit save (⌘S) — save now, then refresh the rendered file --
  const saveAndRefresh = useCallback(async () => {
    await autosave.saveNow(draftRef.current);
    setDirty(false);
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
  useShortcut('mod+shift+f', () => toggleFocusMode(), { allowInInput: true });
  useShortcut('mod+shift+m', () => toggleEditorMode(), { allowInInput: true });
  useShortcut('escape', () => setFocusMode(false), {
    allowInInput: true,
    enabled: focusMode,
  });

  if (loading) return <EditorSkeleton />;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar. In focus mode it keeps only what writing needs: the two
          editing modes, preview, save, and the way back out. */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        {!focusMode && (
          <button
            onClick={() => navigate('/posts')}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <ArrowLeft size={16} /> Posts
          </button>
        )}
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-sm text-fg-subtle',
            focusMode && 'hidden',
          )}
        >
          <span className="shrink-0">Slug:</span>
          <input
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update({ slug: slugify(e.target.value) });
            }}
            title="Edit the slug"
            className={cn(
              'rounded border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[13px] text-fg-muted outline-none transition-colors',
              'hover:border-border focus:border-accent',
              slugError && 'border-danger text-danger',
            )}
          />
          {livePath && (
            <button
              type="button"
              onClick={() => window.open(liveUrl(livePath), '_blank', 'noopener')}
              title={`Open ${livePath} in a new tab`}
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
          <ModeToggle mode={editorMode} onToggle={toggleEditorMode} />
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
          <button
            type="button"
            onClick={toggleFocusMode}
            title={
              focusMode
                ? 'Leave distraction-free mode (Esc)'
                : 'Distraction-free mode'
            }
            aria-label={
              focusMode
                ? 'Leave distraction-free mode'
                : 'Enter distraction-free mode'
            }
            aria-pressed={focusMode}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            {focusMode ? <CornersIn size={17} /> : <CornersOut size={17} />}
          </button>
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
              // Same face as the body below it, so the page reads as one piece
              // of writing rather than a form field above a document.
              className="w-full resize-none bg-transparent font-editor text-[2.4rem] font-bold leading-[1.15] tracking-[-0.02em] outline-none placeholder:text-fg-subtle/50"
            />
            <input
              value={draft.excerpt}
              onChange={(e) => update({ excerpt: e.target.value })}
              placeholder="Add a one-line excerpt…"
              className="mt-3 w-full bg-transparent font-editor text-[17px] italic text-fg-muted outline-none placeholder:not-italic placeholder:text-fg-subtle/60"
            />
          </div>

          <div className="mt-4 flex min-h-0 flex-1 border-t border-border pt-3">
            <div className="mx-auto w-full max-w-3xl min-w-0 overflow-hidden px-8">
              <MarkdownEditor
                value={draft.content}
                onChange={(content) => update({ content })}
                editorRef={cmRef}
                mode={editorMode}
              />
            </div>
          </div>

          <SaveLine
            state={autosave.state}
            savedAt={autosave.savedAt}
            autosaveOn={autosaveOn}
            onAutosave={setAutosave}
            dirty={dirty}
            minimal={focusMode}
          />
        </div>

        {/* Right rail */}
        <aside
          className={cn(
            'hidden w-72 shrink-0 space-y-6 overflow-y-auto border-l border-border bg-bg-subtle p-5',
            !focusMode && 'lg:block',
          )}
        >
          <CoverWidget
            cover={draft.cover}
            onChange={(url) => update({ cover: url })}
          />
          <StatusPills
            status={draft.status}
            pending={statusPending}
            onChange={(s) => void setStatus(s)}
          />
          <PublishDateField
            value={draft.published_at}
            status={draft.status}
            statusPending={statusPending}
            onCommit={(published_at) => {
              update({ published_at });
              autosave.flush();
            }}
          />
          <CategoryField
            categoryId={draft.category_id}
            weight={draft.weight}
            onChange={(patch) => update(patch)}
          />
          <TagsInput tags={draft.tags} onChange={(tags) => update({ tags })} />
          <FaqSection faqs={draft.faqs} onChange={(faqs) => update({ faqs })} />
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

/**
 * Rendered-markdown vs raw source. The document is markdown either way, so
 * this is a view switch, not a conversion — nothing can be lost by flipping it.
 */
function ModeToggle({
  mode,
  onToggle,
}: {
  mode: EditorMode;
  onToggle: () => void;
}) {
  const wysiwyg = mode === 'wysiwyg';
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={wysiwyg}
      title={
        wysiwyg
          ? 'Showing rendered markdown — switch to the source'
          : 'Showing markdown source — switch to rendered'
      }
      className="flex items-center gap-1 rounded-md border border-border p-0.5 text-fg-subtle"
    >
      <span
        className={cn(
          'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
          wysiwyg ? 'bg-bg-muted text-fg' : 'hover:text-fg',
        )}
      >
        <TextAa size={14} /> Rich
      </span>
      <span
        className={cn(
          'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
          wysiwyg ? 'hover:text-fg' : 'bg-bg-muted text-fg',
        )}
      >
        <MarkdownLogo size={14} /> Markdown
      </span>
    </button>
  );
}

function SaveLine({
  state,
  savedAt,
  autosaveOn,
  onAutosave,
  dirty,
  minimal,
}: {
  state: ReturnType<typeof useAutosave>['state'];
  savedAt: Date | null;
  autosaveOn: boolean;
  onAutosave: (on: boolean) => void;
  /** Edits made while autosave is off, still only in the editor. */
  dirty: boolean;
  /** Drop the controls — focus mode keeps only the writing feedback. */
  minimal?: boolean;
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
        : dirty
          ? 'Unsaved changes'
          : savedAt
            ? `Saved ${relativeTime(savedAt)}`
            : autosaveOn
              ? 'Draft autosaves as you type'
              : 'Autosave is off';
  return (
    <div
      aria-live="polite"
      className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-8 text-xs text-fg-subtle"
    >
      {!minimal && (
        <>
          <span className="flex items-center gap-1.5">
            Autosave
            <Toggle
              checked={autosaveOn}
              onChange={onAutosave}
              label="Autosave"
              size="sm"
            />
          </span>
          <span aria-hidden className="text-border-strong">
            ·
          </span>
        </>
      )}
      <motion.span
        key={state}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-1.5"
      >
        {state === 'saving' && (
          <ArrowsClockwise size={12} className="animate-spin" />
        )}
        {state === 'saved' && !dirty && (
          <CloudCheck size={13} className="text-success" />
        )}
        {dirty && state !== 'saving' && (
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        )}
        {label}
      </motion.span>
      {!minimal && (
        <span className="ml-auto">
          Press <Kbd keys="mod+s" />{' '}
          {autosaveOn ? 'to refresh the rendered file' : 'to save'}
        </span>
      )}
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
