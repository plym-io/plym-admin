import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { motion } from 'motion/react';
import { PencilSimpleLine, ArrowRight } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { usePostsStore } from '@/store/posts';
import { useMediaStore } from '@/store/media';
import { timeGreeting, relativeTime } from '@/lib/format';
import { StatusDot } from '@/components/ui/status';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { list: posts, setList: setPosts } = usePostsStore();
  const { list: media, setList: setMedia } = useMediaStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      call(
        api.GET('/api/posts', {
          params: { query: { include_drafts: true, page: 1, page_size: 5 } },
        }),
      ).then((p) => setPosts(p.items)),
      call(
        api.GET('/api/media', { params: { query: { page: 1, page_size: 6 } } }),
      ).then((m) => setMedia(m.items)),
    ]).finally(() => setLoading(false));
  }, [setPosts, setMedia]);

  const recentPosts = [...posts]
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
    .slice(0, 5);
  const recentMedia = media.slice(0, 6);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:px-8">
      <motion.h1
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="font-serif text-3xl font-bold tracking-tight"
      >
        {timeGreeting()}
        {user?.display_name ? `, ${user.display_name.split(' ')[0]}.` : '.'}
      </motion.h1>

      {/* Primary action */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        onClick={() => navigate('/posts/new')}
        className="group mt-8 flex w-full items-center justify-between overflow-hidden rounded-xl border border-border bg-bg-subtle p-6 text-left transition-colors hover:border-accent/40"
      >
        <span className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-white">
            <PencilSimpleLine size={20} weight="duotone" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-fg">
              Start a new post
            </span>
            <span className="block text-sm text-fg-muted">
              Blank page, blinking cursor. The good part.
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3 text-fg-subtle">
          <Kbd keys="mod+n" />
          <ArrowRight
            size={18}
            className="transition-transform group-hover:translate-x-1"
          />
        </span>
      </motion.button>

      <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr]">
        {/* Recent posts */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
              Recent posts
            </h2>
            <Link to="/posts" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentPosts.length === 0 ? (
            <p className="py-6 text-sm text-fg-muted">
              Nothing here yet. Start writing.
            </p>
          ) : (
            <div className="flex flex-col">
              {recentPosts.map((p) => (
                <Link
                  key={p.id}
                  to={`/posts/${p.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-bg-muted"
                >
                  <StatusDot status={p.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {p.title}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle tnum">
                    {relativeTime(p.updated_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent uploads */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">
              Recent uploads
            </h2>
            <Link to="/media" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : recentMedia.length === 0 ? (
            <p className="py-6 text-sm text-fg-muted">No uploads yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
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
                    className="h-full w-full object-cover transition-transform hover:scale-[0.97]"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
