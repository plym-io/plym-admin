import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  Article,
  ArrowRight,
  Images,
  PencilSimpleLine,
  Target,
  UploadSimple,
  Users,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { usePostsStore } from '@/store/posts';
import { useMediaStore } from '@/store/media';
import { timeGreeting, relativeTime } from '@/lib/format';
import type { UiIcon } from '@/components/ui/icon';
import { Page, Panel, PanelHeader } from '@/components/ui/page';
import { StatusDot } from '@/components/ui/status';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/classnames';

interface Counts {
  posts: number | null;
  published: number | null;
  media: number | null;
  users: number | null;
  leads: number | null;
}

const EMPTY_COUNTS: Counts = {
  posts: null,
  published: null,
  media: null,
  users: null,
  leads: null,
};

/** One number, one label. The console's top line. */
function Stat({
  icon: Icon,
  label,
  value,
  to,
  hint,
}: {
  icon: UiIcon;
  label: string;
  value: number | null;
  to: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-border bg-bg p-4 shadow-xs transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2 text-fg-subtle">
        <Icon size={15} weight="duotone" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      {value === null ? (
        <Skeleton className="mt-2.5 h-7 w-12" />
      ) : (
        <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-fg tnum">
          {value}
        </p>
      )}
      {/* Reserve the line whether or not there's a hint, so a row of tiles
          keeps one baseline. */}
      <p className="mt-1.5 min-h-4 text-[12px] text-fg-subtle">{hint}</p>
    </Link>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'administrator';
  const { list: posts, setList: setPosts } = usePostsStore();
  const { list: media, setList: setMedia } = useMediaStore();
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The count-only queries ask for `page_size: 1`: we want the envelope's
    // total, not the rows — the dashboard shouldn't pull the whole library to
    // print a number.
    Promise.allSettled([
      call(
        api.GET('/api/posts', {
          params: { query: { include_drafts: true, page: 1, page_size: 6 } },
        }),
      ).then((p) => {
        setPosts(p.items);
        setCounts((c) => ({ ...c, posts: p.total }));
      }),
      // Without `include_drafts` this counts published posts only, which is
      // what makes the draft figure below a subtraction rather than a guess.
      call(
        api.GET('/api/posts', { params: { query: { page: 1, page_size: 1 } } }),
      ).then((p) => setCounts((c) => ({ ...c, published: p.total }))),
      call(
        api.GET('/api/media', { params: { query: { page: 1, page_size: 8 } } }),
      ).then((m) => {
        setMedia(m.items);
        setCounts((c) => ({ ...c, media: m.total }));
      }),
      call(
        api.GET('/api/users', { params: { query: { page: 1, page_size: 1 } } }),
      ).then((u) => setCounts((c) => ({ ...c, users: u.total }))),
      // Submissions are administrator-only; asking as anyone else is a 403.
      ...(isAdmin
        ? [
            call(
              api.GET('/api/submissions', {
                params: { query: { page: 1, page_size: 1 } },
              }),
            ).then((s) => setCounts((c) => ({ ...c, leads: s.total }))),
          ]
        : []),
    ]).finally(() => setLoading(false));
  }, [setPosts, setMedia, isAdmin]);

  const recentPosts = [...posts]
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
    .slice(0, 6);
  const recentMedia = media.slice(0, 8);
  const drafts =
    counts.posts !== null && counts.published !== null
      ? counts.posts - counts.published
      : null;

  return (
    <Page width="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[21px] font-semibold tracking-tight text-fg">
          {timeGreeting()}
          {user?.display_name ? `, ${user.display_name.split(' ')[0]}.` : '.'}
        </h1>
        <button
          onClick={() => navigate('/posts/new')}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-[13.5px] font-medium text-accent-fg shadow-xs transition-all hover:brightness-105"
        >
          <PencilSimpleLine size={16} weight="duotone" />
          New post
          <Kbd
            keys="mod+i"
            className="border-accent-fg/25 bg-accent-fg/10 text-accent-fg/80"
          />
        </button>
      </div>

      <div
        className={cn(
          'mt-6 grid gap-3 sm:grid-cols-2',
          isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <Stat
          icon={Article}
          label="Posts"
          value={counts.posts}
          to="/posts"
          hint={drafts !== null ? `${drafts} in draft` : undefined}
        />
        <Stat icon={Images} label="Media" value={counts.media} to="/media" />
        <Stat icon={Users} label="Users" value={counts.users} to="/users" />
        {isAdmin && (
          <Stat icon={Target} label="Leads" value={counts.leads} to="/leads" />
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Panel flush>
          <PanelHeader
            title="Recent posts"
            actions={
              <Link
                to="/posts"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
              >
                View all <ArrowRight size={12} />
              </Link>
            }
          />
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : recentPosts.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-fg-muted">
              Nothing here yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recentPosts.map((p) => (
                <Link
                  key={p.id}
                  to={`/posts/${p.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-subtle"
                >
                  <StatusDot status={p.status} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                    {p.title || 'Untitled'}
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-subtle tnum">
                    {relativeTime(p.updated_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Recent uploads"
            actions={
              <Link
                to="/media?upload=1"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
              >
                <UploadSimple size={12} /> Upload
              </Link>
            }
          />
          {loading ? (
            <div className="grid grid-cols-4 gap-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : recentMedia.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-fg-muted">
              No uploads yet.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 p-4">
              {recentMedia.map((m) => (
                <Link
                  key={m.id}
                  to="/media"
                  className="aspect-square overflow-hidden rounded-md border border-border bg-bg-muted"
                >
                  <img
                    src={m.url}
                    alt={m.original_name ?? m.filename}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                  />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Page>
  );
}
