const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * The post's stored instant as a `datetime-local` input value.
 *
 * Reads UTC parts, not local ones. The templates render the stored value with
 * `strftime('%B %d, %Y')`, so the day the site shows is the UTC day — an author
 * east or west of UTC editing in their own zone could set "March 4" and watch
 * the post go out dated March 3.
 */
export function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * A `datetime-local` value back to the instant the API stores, reading the
 * wall clock the author typed as UTC so the date they set is the date rendered.
 *
 * Null means "no publish date". A blank input is the only way to reach it in
 * practice: `datetime-local` reports `''` for anything it can't parse, so an
 * incomplete entry never lands here as a half-formed date.
 */
export function fromInputValue(text: string): string | null {
  const match = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match;
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds ?? '00'}Z`;
}

/**
 * The date exactly as the published post will carry it, mirroring the
 * `%B %d, %Y` in the post template. Shown under the field so the author can
 * see the rendered day rather than infer it from a UTC timestamp.
 */
export function renderedDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())}, ${pad(d.getUTCFullYear(), 4)}`;
}
