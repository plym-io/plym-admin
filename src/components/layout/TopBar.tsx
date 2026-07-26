import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  MagnifyingGlass,
  Sidebar as SidebarIcon,
  SignOut,
  Keyboard,
  UserCircle,
} from '@phosphor-icons/react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { Kbd } from '@/components/ui/kbd';
import { ProfileSheet } from './ProfileSheet';
import { cn } from '@/lib/classnames';
import { asset } from '@/lib/base';

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const setShortcuts = useUiStore((s) => s.setShortcutsOpen);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = (user?.display_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // A new avatar URL (e.g. after editing the profile) gets a fresh load attempt.
  useEffect(() => setAvatarError(false), [user?.avatar_url]);

  // Prefer the profile avatar when one is set (and loads); fall back to initials.
  const showAvatar = Boolean(user?.avatar_url) && !avatarError;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn(
          'flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-105',
          showAvatar
            ? 'bg-bg-muted'
            : 'bg-accent-soft text-[11px] font-semibold text-accent',
        )}
        aria-label="Account menu"
      >
        {showAvatar ? (
          <img
            src={user!.avatar_url!}
            alt={user?.display_name ?? ''}
            className="h-full w-full object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          initials
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-lg border border-border bg-bg-subtle p-1 shadow-lg"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-fg">
                {user?.display_name}
              </p>
              <p className="truncate text-xs text-fg-muted">{user?.email}</p>
            </div>
            <div className="my-1 border-t border-border" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setProfileOpen(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <UserCircle size={16} /> Edit profile
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setShortcuts(true);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <span className="flex items-center gap-2">
                <Keyboard size={16} /> Keyboard shortcuts
              </span>
              <Kbd keys="?" />
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                clear();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <SignOut size={16} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export function TopBar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openCommand = useUiStore((s) => s.setCommandOpen);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md">
      <button
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
      >
        <SidebarIcon size={18} />
      </button>

      <Link
        to="/"
        className="flex items-center transition-opacity hover:opacity-95"
      >
        <img
          src={asset('logo.svg')}
          alt="plym"
          className="h-7 max-h-8 w-auto"
          onError={(e) => {
            // Fall back to a wordmark if the logo asset isn't there.
            const el = e.currentTarget;
            el.style.display = 'none';
            el.insertAdjacentHTML(
              'afterend',
              '<span class="font-display text-lg font-bold tracking-tight">plym</span>',
            );
          }}
        />
      </Link>

      <button
        onClick={() => openCommand(true)}
        className={cn(
          'group ml-2 flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-bg-subtle px-3',
          'text-sm text-fg-subtle transition-colors hover:border-border-strong',
        )}
      >
        <MagnifyingGlass size={15} />
        <span>Search posts, jump anywhere…</span>
        <Kbd keys="mod+k" className="ml-auto" />
      </button>

      <div className="ml-auto flex items-center gap-1">
        <UserMenu />
      </div>
    </header>
  );
}
