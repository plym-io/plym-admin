import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns';

/** "3m ago", "2h ago" — compact relative time for streams and meta columns. */
export function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true })
    .replace(' seconds', 's')
    .replace(' second', 's')
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' days', 'd')
    .replace(' day', 'd')
    .replace(' months', 'mo')
    .replace(' month', 'mo')
    .replace(' years', 'y')
    .replace(' year', 'y');
}

/** Full timestamp for hover titles: "Jun 5, 2026, 2:14 PM". */
export function fullTimestamp(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, "MMM d, yyyy, h:mm a");
}

/** Friendly day label for activity grouping. */
export function dayLabel(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

/** Compact post-list date: "Jun 5" or "Jun 5, 2025" if not this year. */
export function shortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'MMM d' : 'MMM d, yyyy');
}

/** Human file size: 1536 → "1.5 KB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Bare hostname for display: "https://www.medium.com/x" → "medium.com". */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Greeting that varies by local time of day. */
export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Derive a URL-safe slug from a title, matching the API's slug pattern. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240);
}
