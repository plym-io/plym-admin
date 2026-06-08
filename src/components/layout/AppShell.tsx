import { Outlet, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ShortcutsHelp } from '@/components/command/ShortcutsHelp';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';

export function AppShell() {
  const location = useLocation();
  useGlobalShortcuts();

  // Fade each route in on enter. We deliberately avoid AnimatePresence
  // "wait" mode here: rapid sidebar clicks interrupt the exit animation and
  // leave the incoming route stuck at opacity 0 (blank page). A keyed
  // fade-in has no exit phase, so it can't get stuck.
  //
  // All editor paths share one key so creating a post (/posts/new →
  // /posts/:id) and switching between posts don't remount the editor.
  const path = location.pathname;
  const transitionKey =
    path === '/posts' || !path.startsWith('/posts/') ? path : 'post-editor';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <motion.div
            key={transitionKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CommandPalette />
      <ShortcutsHelp />
    </div>
  );
}
