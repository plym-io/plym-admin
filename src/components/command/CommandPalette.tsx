import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Article,
  House,
  Images,
  Users as UsersIcon,
  Pulse,
  GearSix,
  PlusCircle,
  UploadSimple,
  SignOut,
  MagnifyingGlass,
  ArrowUpRight,
} from '@phosphor-icons/react';
import { useUiStore } from '@/store/ui';
import { usePostsStore } from '@/store/posts';
import { useAuthStore } from '@/store/auth';
import { call, api } from '@/api/client';
import { useDebouncedValue } from '@/hooks/use-debounced';
import { hostname } from '@/lib/format';
import { StatusDot } from '@/components/ui/status';
import { Kbd } from '@/components/ui/kbd';
import './command.css';

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const posts = usePostsStore((s) => s.list);
  const setList = usePostsStore((s) => s.setList);
  const role = useAuthStore((s) => s.user?.role);
  const clear = useAuthStore((s) => s.clear);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 200);

  // Query posts (drafts included) server-side while open, debounced.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    call(
      api.GET('/api/posts', {
        params: {
          query: {
            include_drafts: true,
            page: 1,
            page_size: 50,
            ...(debouncedSearch && { search: debouncedSearch }),
          },
        },
      }),
    )
      .then((p) => !cancelled && setList(p.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch, setList]);

  // Reset the query each time the palette closes.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: -4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl"
          >
            <Command
              label="Command palette"
              className="overflow-hidden rounded-xl border border-border bg-bg-subtle shadow-lg"
              loop
            >
              <div className="flex items-center gap-2 border-b border-border px-4">
                <MagnifyingGlass size={16} className="text-fg-subtle" />
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search posts or jump to a page…"
                  className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
              <Command.List className="max-h-[min(60vh,400px)] overflow-y-auto p-2">
                <Command.Empty className="py-10 text-center text-sm text-fg-muted">
                  Nothing matches. Try a post title or a page name.
                </Command.Empty>

                {posts.length > 0 && (
                  <Command.Group heading="Posts">
                    {posts.map((p) => (
                      <Command.Item
                        key={p.id}
                        value={`post ${p.title} ${p.slug}`}
                        onSelect={() => go(`/posts/${p.id}`)}
                      >
                        <StatusDot status={p.status} />
                        <span className="truncate">{p.title}</span>
                        <span className="ml-auto flex items-center gap-2 text-[11px] text-fg-subtle">
                          {p.canonical_url && (
                            <span className="flex items-center gap-0.5">
                              <ArrowUpRight size={11} />
                              {hostname(p.canonical_url)}
                            </span>
                          )}
                          <span className="font-mono">{p.slug}</span>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Quick actions">
                  <Command.Item value="new post create" onSelect={() => go('/posts/new')}>
                    <PlusCircle size={16} />
                    New post
                    <Kbd keys="mod+n" className="ml-auto" />
                  </Command.Item>
                  <Command.Item value="upload media" onSelect={() => go('/media?upload=1')}>
                    <UploadSimple size={16} />
                    Upload media
                  </Command.Item>
                  <Command.Item value="sign out logout" onSelect={() => run(clear)}>
                    <SignOut size={16} />
                    Sign out
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Pages">
                  <Command.Item value="home" onSelect={() => go('/')}>
                    <House size={16} /> Home
                  </Command.Item>
                  <Command.Item value="posts" onSelect={() => go('/posts')}>
                    <Article size={16} /> Posts
                  </Command.Item>
                  <Command.Item value="media library" onSelect={() => go('/media')}>
                    <Images size={16} /> Media
                  </Command.Item>
                  {role === 'administrator' && (
                    <Command.Item value="users" onSelect={() => go('/users')}>
                      <UsersIcon size={16} /> Users
                    </Command.Item>
                  )}
                  <Command.Item value="logs activity" onSelect={() => go('/logs')}>
                    <Pulse size={16} /> Logs
                  </Command.Item>
                  <Command.Item value="settings config" onSelect={() => go('/settings')}>
                    <GearSix size={16} /> Settings
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
