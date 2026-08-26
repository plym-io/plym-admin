import { useEffect } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import {
  useThemeStore,
  watchSystemTheme,
  type ThemePreference,
} from '@/store/theme';
import { cn } from '@/lib/classnames';

const NEXT: Record<'light' | 'dark', ThemePreference> = {
  light: 'dark',
  dark: 'light',
};

/**
 * One button, not a three-way menu. The preference is still tri-state — a
 * fresh panel follows the OS and keeps following it — but once you reach for
 * this you have an opinion, and clicking twice to get back where you were is
 * the only behaviour anyone expects from a light/dark switch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const resolved = useThemeStore((s) => s.resolved);
  const setPreference = useThemeStore((s) => s.setPreference);
  const preference = useThemeStore((s) => s.preference);

  useEffect(() => watchSystemTheme(), []);

  const dark = resolved === 'dark';

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[resolved])}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={
        preference === 'system'
          ? `Following your system (${resolved})`
          : `${dark ? 'Dark' : 'Light'} theme`
      }
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg',
        className,
      )}
    >
      {dark ? <Moon size={17} weight="fill" /> : <Sun size={17} />}
    </button>
  );
}
