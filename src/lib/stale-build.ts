/**
 * The phrases a browser writes when a module the page asked for never
 * arrived. There is nothing else to go on: the rejection is a bare TypeError
 * with no status, no request and no cause, and each engine words it its own
 * way — Chromium "Failed to fetch dynamically imported module", Firefox
 * "error loading dynamically imported module", Safari "Importing a module
 * script failed". Vite's preload helper adds one of its own for a stylesheet
 * that went with the chunk.
 */
const MISSING_MODULE = [
  'dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
];

/**
 * Whether a failure is this panel asking for a piece of a build that is no
 * longer being served.
 *
 * Every screen here is imported lazily under a content-hashed filename, so an
 * update replaces the exact files an already-open panel is still holding
 * references to. The next navigation fetches a chunk that stopped existing,
 * and a panel that is mid-restart or unreachable fails that same fetch the
 * same way. Both are the deploy the reader is waiting out, not a fault in the
 * screen they were heading for.
 */
export function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const text = message.toLowerCase();
  return MISSING_MODULE.some((phrase) => text.includes(phrase));
}
