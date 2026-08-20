/**
 * A post's excerpt is its `<meta name="description">`, its `og:description`,
 * its `twitter:description` and the `description` in its JSON-LD (see plym's
 * post chrome). Publishing with the field empty ships all four missing, so
 * this derives one from the opening prose when the author left it blank.
 *
 * Markdown in, one line of plain text out. Everything structural — headings,
 * fences, tables, `:::` blocks — is skipped rather than flattened, because a
 * search result reading "note Read this first" is worse than a shorter one.
 */

/** Search engines show around this much of a description before cutting it. */
const MAX_LENGTH = 155;

const FENCE = /^\s*(?:```|~~~)/;
const COLON_OPEN = /^\s*:::+\s*\S/;
const COLON_CLOSE = /^\s*:::+\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const SETEXT = /^\s{0,3}(?:=+|-{2,})\s*$/;
const RULE = /^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/;
const TABLE_ROW = /^\s*\|/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;
const QUOTE_MARKER = /^\s*>+\s?/;
const IMAGE_ONLY = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;

/** Lines that carry no prose, or whose prose belongs to something else. */
function isStructural(line: string): boolean {
  return (
    HEADING.test(line) ||
    SETEXT.test(line) ||
    RULE.test(line) ||
    TABLE_ROW.test(line) ||
    IMAGE_ONLY.test(line)
  );
}

/**
 * Drop whole blocks rather than their markers: code and `gallery` are both
 * fences in plym, and an admonition's body is an aside, not the opening line.
 * `:::` inside a fence is inert, so the fence is tracked first.
 */
function withoutBlocks(content: string): string[] {
  const kept: string[] = [];
  let fenced = false;
  let depth = 0;

  for (const line of content.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    if (COLON_OPEN.test(line)) {
      depth += 1;
      continue;
    }
    if (COLON_CLOSE.test(line)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) kept.push(line);
  }
  return kept;
}

/** The first run of consecutive prose lines. */
function firstParagraph(lines: string[]): string {
  const paragraph: string[] = [];
  for (const line of lines) {
    const text = line.replace(QUOTE_MARKER, '').replace(LIST_MARKER, '');
    if (text.trim() === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    if (isStructural(line)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(text.trim());
  }
  return paragraph.join(' ');
}

/**
 * Markdown's punctuation, removed so the description reads as a sentence.
 * Emphasis is matched only on unescaped delimiters — `\*literal\*` is text the
 * author asked for — so unescaping has to come last.
 */
function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(?<!\\)`+([^`]*)`+/g, '$1')
    .replace(/(?<!\\)(\*\*|__)([\s\S]*?)(?<!\\)\1/g, '$2')
    .replace(/(?<!\\)(\*|_)([\s\S]*?)(?<!\\)\1/g, '$2')
    .replace(/(?<!\\)~~([\s\S]*?)(?<!\\)~~/g, '$1')
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut on a word boundary — a description ending mid-word reads as broken. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const head = (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:.!?-]+$/,
    '',
  );
  return `${head}…`;
}

export function deriveExcerpt(content: string, max = MAX_LENGTH): string {
  return truncate(stripInline(firstParagraph(withoutBlocks(content))), max);
}
