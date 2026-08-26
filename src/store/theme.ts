import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the user picked. `system` follows the OS and keeps following it. */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is actually painted. `system` has been resolved by the time it's this. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'plym.theme';

const media = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function systemTheme(): ResolvedTheme {
  return media()?.matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Paint it. Every colour in the app resolves through `[data-theme]`, so this
 * one attribute is the whole switch — no class sweep, no re-render needed for
 * anything that is only styled by CSS.
 */
function paint(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** light ⇄ dark, from whatever is on screen now. */
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: 'light',
      setPreference: (preference) => {
        const resolved = resolveTheme(preference);
        paint(resolved);
        set({ preference, resolved });
      },
      toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ preference: s.preference }),
      // Rehydration is the first moment we know what was chosen last time.
      // The inline script in index.html has already painted the same answer,
      // so this only reconciles the store — nothing flashes.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolved = resolveTheme(state.preference);
        paint(resolved);
        state.resolved = resolved;
      },
    },
  ),
);

/**
 * Keep `system` actually meaning system: if the OS flips while the panel is
 * open, follow it. Only ever attached once, and a no-op for an explicit choice.
 */
let watching = false;
export function watchSystemTheme() {
  if (watching) return;
  const mq = media();
  if (!mq) return;
  watching = true;
  mq.addEventListener('change', () => {
    const { preference, setPreference } = useThemeStore.getState();
    if (preference === 'system') setPreference('system');
  });
}

export const useResolvedTheme = () => useThemeStore((s) => s.resolved);
