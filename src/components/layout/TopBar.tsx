import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  MagnifyingGlass,
  SignOut,
  Keyboard,
  UserCircle,
  CaretRight,
  Sidebar as SidebarIcon,
} from '@phosphor-icons/react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { Kbd } from '@/components/ui/kbd';
import { Avatar } from '@/components/ui/avatar';
import { ProfileSheet } from './ProfileSheet';
import { ThemeToggle } from './ThemeToggle';
import { locateNav } from './nav';
import { cn } from '@/lib/classnames';

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const setShortcuts = useUiStore((s) => s.setShortcutsOpen);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex items-center rounded-full transition-transform hover:scale-105"
        aria-label="Account menu"
      >
        <Avatar
          src={user?.avatar_url}
          name={user?.display_name}
          size={30}
          tone="accent"
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-lg border border-border bg-bg p-1 shadow-lg"
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar src={user?.avatar_url} name={user?.display_name} size={32} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-fg">
                  {user?.display_name}
                </p>
                <p className="truncate text-[12px] text-fg-muted">{user?.email}</p>
              </div>
            </div>
            <div className="my-1 border-t border-border" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setProfileOpen(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <UserCircle size={16} /> Edit profile
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setShortcuts(true);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <span className="flex items-center gap-2">
                <Keyboard size={16} /> Keyboard shortcuts
              </span>
              <Kbd keys="?" />
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                clear();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-danger transition-colors hover:bg-danger/10"
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

/** Section › page, so the console says where you are without a second glance. */
function Breadcrumb() {
  const { pathname } = useLocation();
  const here = locateNav(pathname);
  if (!here) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {here.group && (
        <>
          <span className="hidden shrink-0 text-[13px] text-fg-subtle sm:inline">
            {here.group}
          </span>
          <CaretRight size={11} className="hidden shrink-0 text-fg-subtle sm:inline" />
        </>
      )}
      <span className="truncate text-[13px] font-medium text-fg">
        {here.item.label}
      </span>
    </nav>
  );
}

export function TopBar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openCommand = useUiStore((s) => s.setCommandOpen);
  const [scrolled, setScrolled] = useState(false);

  // The bar earns its shadow only once there is content under it — a border
  // that is always drawn reads as a seam on a page that fits.
  useEffect(() => {
    const main = document.getElementById('plym-main');
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    main.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg px-4 transition-shadow',
        scrolled && 'shadow-sm',
      )}
    >
      {collapsed && (
        <button
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <SidebarIcon size={17} />
        </button>
      )}

      <Breadcrumb />

      <button
        onClick={() => openCommand(true)}
        className={cn(
          'ml-auto flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-bg-subtle px-2.5',
          'text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted',
        )}
      >
        <MagnifyingGlass size={14} className="shrink-0" />
        <span className="truncate">Search…</span>
        <Kbd keys="mod+k" className="ml-auto shrink-0" />
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <div className="mx-0.5 h-5 w-px bg-border" />
        <UserMenu />
      </div>
    </header>
  );
}
