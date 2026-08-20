import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectEdition, rootUser, type Edition } from '@/api/cloud';
import type { Capabilities } from '@/types/cloud';

interface CloudState {
  /** `null` until the probe has answered for the first time. */
  edition: Edition | null;
  capabilities: Capabilities | null;
  detect: () => Promise<void>;
  /** The console's sign-in account, or `null` when this blog has no such fact. */
  rootUserId: number | null;
  loadRoot: () => Promise<void>;
}

/**
 * Which product this panel is driving. One probe on load decides it, and the
 * answer is persisted so a reload paints the right navigation immediately
 * instead of shuffling it a moment later — the probe still runs and corrects
 * the stored answer if a blog has since moved between editions.
 */
export const useCloudStore = create<CloudState>()(
  persist(
    (set, get) => ({
      edition: null,
      capabilities: null,
      detect: async () => {
        const { edition, capabilities } = await detectEdition();
        // An unanswered probe is not an answer: keep whatever we knew.
        if (edition) set({ edition, capabilities });
      },
      rootUserId: null,
      loadRoot: async () => {
        // The gateway advertises this route rather than leaving the panel to
        // discover it by 404, so wait for the edition probe and believe it.
        await detectEditionOnce();
        if (get().capabilities?.root !== true) return;
        set({ rootUserId: await rootUser() });
      },
    }),
    {
      name: 'plym.edition',
      partialize: (s) => ({ edition: s.edition, capabilities: s.capabilities }),
    },
  ),
);

/** One probe per page load, however many callers ask for it. */
let probe: Promise<void> | null = null;
export function detectEditionOnce(): Promise<void> {
  probe ??= useCloudStore.getState().detect();
  return probe;
}

/**
 * One Root lookup per page load. Unlike the edition probe this one needs a
 * session, so it is asked for by the screens that label users rather than
 * fired at startup — and it is not persisted: who Root is can change under a
 * blog, and a chip is only worth showing when it was just confirmed.
 */
let rootProbe: Promise<void> | null = null;
export function loadRootUserOnce(): Promise<void> {
  rootProbe ??= useCloudStore.getState().loadRoot();
  return rootProbe;
}

export const useEdition = () => useCloudStore((s) => s.edition);
export const useIsCloud = () => useCloudStore((s) => s.edition === 'cloud');
export const useRootUserId = () => useCloudStore((s) => s.rootUserId);

/**
 * Whether a cloud feature is switched on for this deployment. Unknown flags
 * count as available — a gateway that doesn't publish one shouldn't hide a
 * screen that works.
 */
export function capabilityOn(caps: Capabilities | null, flag: string): boolean {
  return caps?.[flag] !== false;
}
