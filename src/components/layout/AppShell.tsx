import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ShortcutsHelp } from '@/components/command/ShortcutsHelp';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useUiStore } from '@/store/ui';
import { detectEditionOnce, useEdition } from '@/store/cloud';

export function AppShell() {
  const location = useLocation();
  // Distraction-free mode: the writing surface is the whole window.
  const focusMode = useUiStore((s) => s.focusMode);
  // OSS or cloud. Persisted, so this is only ever unknown on a first visit.
  const edition = useEdition();
  useGlobalShortcuts();

  useEffect(() => {
    void detectEditionOnce();
  }, []);

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

  // Half the navigation depends on the edition, so wait for the probe rather
  // than paint an OSS sidebar and then grow four items under the user's cursor.
  if (!edition) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      {!focusMode && <TopBar />}
      <div className="flex min-h-0 flex-1">
        {!focusMode && <Sidebar />}
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
