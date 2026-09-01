/**
 * The `links:` block of config.yaml — the header and footer navigation a blog
 * renders — in the two shapes it needs: the tree the builder edits, and the
 * YAML the file wants back.
 *
 * plym's own model is the contract mirrored here: every link carries a label
 * and then *either* a destination *or* a submenu, never both and never
 * neither, and a submenu is one level deep. A blog whose config breaks that
 * rule does not boot, so everything below exists to hold a tree that is still
 * half-typed and to name the row that isn't finished yet — rather than to hand
 * back YAML that would take the blog down.
 */

export type NavSlot = 'header' | 'footer';

export const NAV_SLOTS: NavSlot[] = ['header', 'footer'];

/**
 * Written out rather than CSS-capitalised: a tab whose accessible name is
 * "footer" while the screen says "Footer" is two labels for one control.
 */
export const NAV_SLOT_LABEL: Record<NavSlot, string> = {
  header: 'Header',
  footer: 'Footer',
};

/** A link as config.yaml carries it. */
export interface NavLink {
  text: string;
  url?: string;
  children?: NavLink[];
}

export type NavLinks = Record<NavSlot, NavLink[]>;

/** Which of the two things a row is, as the Link/Menu toggle sets it. */
export type NavKind = 'link' | 'menu';

/**
 * A link as the builder holds it. Three differences from the file's shape, all
 * so editing stays undoable: the row is identified, so it keeps focus and caret
 * while the list around it is reordered; `kind` is stated rather than inferred
 * from whether children happen to exist, so emptying a menu leaves a menu to
 * fill in rather than silently becoming a link; and it keeps both a `url` and
 * its `children` whichever kind is selected, so flipping the toggle back
 * restores what was already typed instead of eating it.
 */
export interface NavDraft {
  id: string;
  kind: NavKind;
  text: string;
  url: string;
  children: NavDraft[];
}

export type NavDrafts = Record<NavSlot, NavDraft[]>;

/** A row, as `[index]` at the top level or `[index, childIndex]` beneath one. */
export type NavPath = [number] | [number, number];

// A counter rather than crypto.randomUUID(): the panel is served over plain
// http on a LAN address often enough, and randomUUID only exists in a secure
// context.
let seq = 0;

export function newDraft(): NavDraft {
  seq += 1;
  return { id: `nav-${seq}`, kind: 'link', text: '', url: '', children: [] };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * One link out of whatever `/api/config` returned. Grandchildren are dropped
 * because neither the builder nor the renderer has a level to put them on; a
 * config carrying them would not have loaded in the first place.
 */
function readLink(value: unknown, nested: boolean): NavDraft | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const children =
    !nested && Array.isArray(raw.children)
      ? raw.children.map((c) => readLink(c, true)).filter((c) => c !== null)
      : [];
  const draft: NavDraft = {
    ...newDraft(),
    kind: children.length ? 'menu' : 'link',
    text: text(raw.text),
    url: text(raw.url),
    children,
  };
  return draft.text || draft.url || draft.children.length ? draft : null;
}

function readList(value: unknown): NavDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => readLink(v, false)).filter((v) => v !== null);
}

export function readDrafts(links: unknown): NavDrafts {
  const raw = (links ?? {}) as Record<string, unknown>;
  return { header: readList(raw.header), footer: readList(raw.footer) };
}

/** True for a row that opens a menu rather than going somewhere. */
export function isMenu(item: NavDraft): boolean {
  return item.kind === 'menu';
}

export function toLinks(items: NavDraft[]): NavLink[] {
  return items.map((item) =>
    isMenu(item)
      ? { text: item.text.trim(), children: toLinks(item.children) }
      : { text: item.text.trim(), url: item.url.trim() },
  );
}

/* ── editing ──────────────────────────────────────────────────────────── */

function mapAt(
  items: NavDraft[],
  path: NavPath,
  fn: (item: NavDraft) => NavDraft | null,
): NavDraft[] {
  const [index, childIndex] = path;
  return items.flatMap((item, i) => {
    if (i !== index) return [item];
    if (childIndex === undefined) {
      const next = fn(item);
      return next ? [next] : [];
    }
    return [{ ...item, children: mapAt(item.children, [childIndex], fn) }];
  });
}

export function editAt(
  items: NavDraft[],
  path: NavPath,
  patch: Partial<Omit<NavDraft, 'id'>>,
): NavDraft[] {
  return mapAt(items, path, (item) => ({ ...item, ...patch }));
}

export function removeAt(items: NavDraft[], path: NavPath): NavDraft[] {
  return mapAt(items, path, () => null);
}

/**
 * Lift a row out of its list and put it back at `to`, which is what a drop
 * means. Not a swap: dragging the last row to the top has to leave the rows it
 * passed in the order they were in, and a swap would jumble them.
 */
export function moveTo(items: NavDraft[], path: NavPath, to: number): NavDraft[] {
  const [index, childIndex] = path;
  if (childIndex !== undefined) {
    return items.map((item, i) =>
      i === index ? { ...item, children: moveTo(item.children, [childIndex], to) } : item,
    );
  }
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(index, 1));
  return next;
}

/** Reorder by one place — the keyboard's half of drag and drop. */
export function moveAt(items: NavDraft[], path: NavPath, delta: -1 | 1): NavDraft[] {
  const at = path.length === 2 ? path[1] : path[0];
  return moveTo(items, path, at + delta);
}

/** Add a link to a row's menu. */
export function addChild(items: NavDraft[], index: number): NavDraft[] {
  return items.map((item, i) =>
    i === index ? { ...item, children: [...item.children, newDraft()] } : item,
  );
}

/**
 * Flip a row between the two kinds. Becoming a menu with nothing under it
 * seeds the first child, because an empty menu is the one shape that renders
 * as neither a link nor a menu — the toggle should leave something to fill in,
 * not an error to discover.
 */
export function setKind(items: NavDraft[], index: number, kind: NavKind): NavDraft[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const children =
      kind === 'menu' && !item.children.length ? [newDraft()] : item.children;
    return { ...item, kind, children };
  });
}

/* ── what is not finished yet ─────────────────────────────────────────── */

export type NavFault = 'text' | 'url' | 'menu';

export function faultOf(item: NavDraft): NavFault | null {
  if (!item.text.trim()) return 'text';
  if (isMenu(item)) return item.children.length ? null : 'menu';
  return item.url.trim() ? null : 'url';
}

/**
 * Only what the block will actually carry. A row switched back to Link keeps
 * the children it had, so the toggle is reversible — but they are not written,
 * and half-typed rows nobody can see must not be what withholds the block.
 */
export function faultCount(items: NavDraft[]): number {
  return items.reduce(
    (n, item) => n + (faultOf(item) ? 1 : 0) + (isMenu(item) ? faultCount(item.children) : 0),
    0,
  );
}

/* ── back to config.yaml ──────────────────────────────────────────────── */

const INDICATORS = new Set(Array.from('-?:,[]{}#&*!|>\'"%@`'));
const NOT_A_STRING = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i;

/**
 * A string as YAML will read it back. Plain wherever plain is unambiguous, so
 * the block looks like the one in the docs; double-quoted the moment it isn't,
 * because a label that YAML parses as a boolean or a number is a config the
 * blog refuses to load. JSON's escaping is a subset of YAML's, so
 * `JSON.stringify` is the correct quoted form.
 */
export function yamlScalar(value: string): string {
  const plain =
    value !== '' &&
    value === value.trim() &&
    !INDICATORS.has(value[0]) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.includes(': ') &&
    !value.endsWith(':') &&
    !value.includes(' #') &&
    !NOT_A_STRING.test(value) &&
    Number.isNaN(Number(value));
  return plain ? value : JSON.stringify(value);
}

function block(items: NavLink[], indent: number): string[] {
  const pad = ' '.repeat(indent);
  return items.flatMap((link) => {
    const head = `${pad}- text: ${yamlScalar(link.text)}`;
    return link.children?.length
      ? [head, `${pad}  children:`, ...block(link.children, indent + 4)]
      : [head, `${pad}  url: ${yamlScalar(link.url ?? '')}`];
  });
}

export function toYaml(links: NavLinks): string {
  const lines = ['links:'];
  for (const slot of NAV_SLOTS) {
    const items = links[slot];
    if (!items.length) lines.push(`  ${slot}: []`);
    else lines.push(`  ${slot}:`, ...block(items, 4));
  }
  return lines.join('\n');
}
