import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from './use-debounced';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveResult {
  state: SaveState;
  /** ms since last successful save, or null. Drives the "Saved 2s ago" line. */
  savedAt: Date | null;
  /** Queue a debounced save with the latest payload. */
  schedule: (payload: unknown) => void;
  /** Force an immediate save of whatever is pending. */
  flush: () => void;
}

/**
 * Debounced autosave (BRD §6.4). `save` runs `delay` ms after the last
 * `schedule()`. Tracks save state for the "Saving… / Saved Ns ago" indicator.
 */
export function useAutosave(
  save: (payload: unknown) => Promise<void>,
  delay = 1000,
): AutosaveResult {
  const [state, setState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (payload: unknown) => {
    setState('saving');
    try {
      await saveRef.current(payload);
      setState('saved');
      setSavedAt(new Date());
    } catch {
      setState('error');
    }
  }, []);

  const debounced = useDebouncedCallback((payload: unknown) => {
    void run(payload);
  }, delay);

  const schedule = useCallback(
    (payload: unknown) => {
      setState((s) => (s === 'saved' || s === 'error' ? 'idle' : s));
      debounced(payload);
    },
    [debounced],
  );

  // Save on unmount / tab hide so nothing is lost.
  useEffect(() => {
    const onHide = () => debounced.flush();
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
      debounced.flush();
    };
  }, [debounced]);

  return { state, savedAt, schedule, flush: debounced.flush };
}
