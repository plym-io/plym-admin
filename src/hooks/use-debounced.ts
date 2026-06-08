import { useEffect, useRef, useState, useCallback } from 'react';

/** Debounced copy of a value — re-renders only after `delay` of quiet. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Stable debounced callback. The returned fn also exposes `.flush()`/`.cancel()`. */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay = 300,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  const lastArgs = useRef<A | null>(null);
  fnRef.current = fn;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timer.current && lastArgs.current) {
      clearTimeout(timer.current);
      timer.current = null;
      fnRef.current(...lastArgs.current);
    }
  }, []);

  const debounced = useCallback(
    (...args: A) => {
      lastArgs.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  );

  useEffect(() => cancel, [cancel]);

  return Object.assign(debounced, { cancel, flush });
}
