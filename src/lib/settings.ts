import type {
  Impact,
  Plan,
  PlanChange,
  SettingSchema,
  SettingsChange,
  SettingsDocument,
} from '@/types/cloud';

/**
 * Everything the cloud settings screen needs that isn't a network call: the
 * gateway's payloads normalized into the shapes in `@/types/cloud`, and the
 * value ↔ form-control conversions on either side of an edit.
 *
 * The gateway describes its own settings, so nothing here knows a single key
 * name. It only knows the *kinds* — and how to keep unknown ones editable
 * rather than dropping them.
 */

/** Cheapest first. Anything unrecognised sorts as the most expensive. */
const IMPACT_ORDER: Impact[] = ['none', 'reload', 'rebuild', 'reroute'];

export function worstImpact(impacts: (Impact | undefined)[]): Impact {
  return impacts.reduce<Impact>((worst, i) => {
    const rank = i ? IMPACT_ORDER.indexOf(i) : -1;
    return rank > IMPACT_ORDER.indexOf(worst) ? (i as Impact) : worst;
  }, 'none');
}

/** True for the impacts that recreate the container or move published URLs. */
export function isHeavy(impact: Impact): boolean {
  return impact === 'rebuild' || impact === 'reroute';
}

/**
 * Dotted-key view of a config document. Nested objects flatten to
 * `colors.primary`; an already-flat document passes through unchanged, so it
 * doesn't matter which of the two the gateway sends.
 */
export function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** First present of `names` on `obj`, or undefined. */
function pick(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A list of human-readable lines from strings, or objects that contain one. */
function asLines(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return (
          asString(pick(o, 'message', 'label', 'description', 'text', 'name')) ??
          JSON.stringify(v)
        );
      }
      return String(v);
    })
    .filter(Boolean);
}

function asImpact(value: unknown): Impact | undefined {
  return typeof value === 'string' && (IMPACT_ORDER as string[]).includes(value)
    ? (value as Impact)
    : undefined;
}

/** Entries as an array, whether the gateway sent an array or a key→entry map. */
function entries(raw: unknown): [string | undefined, Record<string, unknown>][] {
  if (Array.isArray(raw)) {
    return raw
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
      .map((e) => [undefined, e]);
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
      k,
      (v && typeof v === 'object' ? v : { value: v }) as Record<string, unknown>,
    ]);
  }
  return [];
}

export function normalizeSchema(raw: unknown): SettingSchema[] {
  const out: SettingSchema[] = [];
  for (const [mapKey, e] of entries(raw)) {
    const key = asString(pick(e, 'key', 'name', 'id', 'path')) ?? mapKey;
    if (!key) continue;
    out.push({
      key,
      kind: asString(pick(e, 'kind', 'type', 'format')) ?? 'line',
      // An entry with no stated impact is assumed to cost at least a reload —
      // never "none", so the Deploy modal can't promise a change is free.
      impact: asImpact(pick(e, 'impact')) ?? 'reload',
      effects: asLines(pick(e, 'effects', 'effect')),
      note: asString(pick(e, 'note', 'description', 'help')),
      label: asString(pick(e, 'label', 'title')),
      choices: Array.isArray(e.choices ?? e.options ?? e.enum)
        ? ((e.choices ?? e.options ?? e.enum) as unknown[]).map((c) =>
            typeof c === 'string'
              ? c
              : (asString(pick(c as Record<string, unknown>, 'id', 'value', 'name')) ??
                String(c)),
          )
        : undefined,
    });
  }
  return out;
}

/** Template ids, from a bare list, a list of objects, or `{installed, available}`. */
export function normalizeTemplates(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).available ??
        (raw as Record<string, unknown>).installed ??
        [])
      : [];
  if (!Array.isArray(list)) return [];
  return list
    .map((t) =>
      typeof t === 'string'
        ? t
        : t && typeof t === 'object'
          ? (asString(pick(t as Record<string, unknown>, 'id', 'name', 'slug')) ?? '')
          : '',
    )
    .filter(Boolean);
}

export function normalizeSettings(raw: unknown): SettingsDocument {
  const doc = (raw ?? {}) as Record<string, unknown>;
  return {
    values: flatten(doc.values ?? doc),
    schema: normalizeSchema(doc.schema ?? doc.fields),
    templates: normalizeTemplates(doc.templates),
  };
}

function normalizeChanges(raw: unknown): PlanChange[] {
  return entries(raw)
    .map(([mapKey, c]) => ({
      key: asString(pick(c, 'key', 'name', 'path')) ?? mapKey ?? '',
      from: pick(c, 'from', 'old', 'before', 'current', 'was'),
      to: pick(c, 'to', 'new', 'after', 'value'),
    }))
    .filter((c) => c.key);
}

export function normalizePlan(raw: unknown): Plan {
  const p = (raw ?? {}) as Record<string, unknown>;
  const changes = normalizeChanges(p.changes ?? p.diff);
  return {
    changes,
    effects: asLines(p.effects),
    impact: asImpact(p.impact) ?? 'reload',
  };
}

export function normalizeChangeLog(raw: unknown): SettingsChange[] {
  const list = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown>)?.changes ??
      (raw as Record<string, unknown>)?.items ??
      []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c) => ({
      key: asString(pick(c, 'key', 'name', 'path')) ?? '',
      from: pick(c, 'from', 'old', 'before'),
      to: pick(c, 'to', 'new', 'after', 'value'),
      at: asString(pick(c, 'at', 'when', 'timestamp', 'created_at')),
      actor: asString(pick(c, 'actor', 'by', 'user', 'email')),
      op_id: asString(pick(c, 'op_id')),
    }))
    .filter((c) => c.key);
}

/**
 * A value as its form control holds it: booleans stay booleans, everything
 * else is text. Lists become a comma-separated line, which is the shape the
 * gateway's patch schema takes them in.
 */
export function toInput(kind: string, value: unknown): string | boolean {
  if (kind === 'bool' || typeof value === 'boolean') return Boolean(value);
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The other direction — only `int` needs to leave as something but a string. */
export function fromInput(kind: string, input: string | boolean): unknown {
  if (typeof input === 'boolean') return input;
  if (kind === 'int') {
    const n = Number(input.trim());
    return input.trim() !== '' && Number.isFinite(n) ? Math.trunc(n) : input;
  }
  return input;
}

/**
 * The patch to send: only the keys whose control no longer shows what the
 * server has. Compared as the control holds them, so "8" and 8 don't count as
 * a change and neither does a list that has only been re-spaced.
 */
export function buildPatch(
  schema: SettingSchema[],
  values: Record<string, unknown>,
  draft: Record<string, string | boolean>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema) {
    if (!(field.key in draft)) continue;
    const current = toInput(field.kind, values[field.key]);
    const edited = draft[field.key];
    if (edited !== current) patch[field.key] = fromInput(field.kind, edited);
  }
  return patch;
}

/** Every editable key, as the form should first show it. */
export function initialDraft(
  schema: SettingSchema[],
  values: Record<string, unknown>,
): Record<string, string | boolean> {
  return Object.fromEntries(
    schema.map((f) => [f.key, toInput(f.kind, values[f.key])]),
  );
}

/**
 * Fields grouped by their dotted prefix, in the order the schema lists them.
 * Top-level keys (`name`, `template`, …) collect under "Site".
 *
 * This is the raw shape of the document. What the screen shows is
 * `sectionsFor` below, which files those prefixes under names a reader
 * recognises rather than the config's own key layout.
 */
export function groupSchema(
  schema: SettingSchema[],
): { title: string; fields: SettingSchema[] }[] {
  const groups = new Map<string, SettingSchema[]>();
  for (const field of schema) {
    const dot = field.key.indexOf('.');
    const title = dot === -1 ? 'Site' : field.key.slice(0, dot);
    const bucket = groups.get(title);
    if (bucket) bucket.push(field);
    else groups.set(title, [field]);
  }
  // "Site" leads whether or not its first key came first in the schema.
  return [...groups.entries()]
    .sort((a, b) => Number(b[0] === 'Site') - Number(a[0] === 'Site'))
    .map(([title, fields]) => ({ title, fields }));
}

/* ── the settings screen's own layout ─────────────────────────────────── */

export interface SectionSpec {
  id: string;
  title: string;
  description?: string;
  /** Exact top-level keys, and dotted prefixes, that belong here. */
  keys?: string[];
  prefixes?: string[];
}

/**
 * How the settings screen is organised, which is deliberately not how the
 * config file is. `reading` and `inject` sit under Advanced with the rest of
 * the machinery; the things an owner changes weekly sit at the top.
 *
 * The last section has no matchers and is the catch-all: a key this list has
 * never heard of still gets rendered, under Advanced, rather than being
 * silently dropped from the form.
 */
export const SECTIONS: SectionSpec[] = [
  {
    id: 'general',
    title: 'General',
    description: 'How the blog introduces itself.',
    keys: ['name', 'description', 'language', 'website', 'blog_home', 'blog_prefix'],
  },
  {
    id: 'branding',
    title: 'Branding',
    description: 'Marks, colours and type.',
    keys: ['logo', 'favicon'],
    prefixes: ['colors', 'fonts'],
  },
  {
    id: 'template',
    title: 'Template',
    description: 'Which theme renders the blog.',
    keys: ['template'],
  },
  {
    id: 'content',
    title: 'Content',
    description: 'How posts and listings are presented.',
    prefixes: ['pagination', 'prism'],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'Injected markup, caching, crawlers and everything else.',
  },
];

/**
 * Roots the settings screen deliberately doesn't render, because something else
 * owns them. `mcp` has its own item in the sidebar, where the switch starts and
 * stops a container and shows the operation as it runs — a second copy under
 * Advanced would be a quieter way to do the same thing, and the two would
 * disagree the moment either was used.
 */
const OWNED_ELSEWHERE = ['mcp'];

/** True for a key some other screen is responsible for. */
export function hasOwnScreen(key: string): boolean {
  const dot = key.indexOf('.');
  return OWNED_ELSEWHERE.includes(dot === -1 ? key : key.slice(0, dot));
}

function sectionFor(key: string): SectionSpec {
  const prefix = key.includes('.') ? key.slice(0, key.indexOf('.')) : null;
  for (const section of SECTIONS) {
    if (!prefix && section.keys?.includes(key)) return section;
    if (prefix && section.prefixes?.includes(prefix)) return section;
  }
  return SECTIONS[SECTIONS.length - 1];
}

export interface Section<T> {
  id: string;
  title: string;
  description?: string;
  fields: T[];
}

/**
 * Group anything key-shaped into the screen's sections, in `SECTIONS` order.
 * Empty sections are dropped — a deployment that publishes no branding keys
 * shouldn't show a Branding tab with nothing under it — and so are the keys
 * another screen owns.
 */
export function sectionsFor<T extends { key: string }>(fields: T[]): Section<T>[] {
  const buckets = new Map<string, T[]>();
  for (const field of fields) {
    if (hasOwnScreen(field.key)) continue;
    const section = sectionFor(field.key);
    const bucket = buckets.get(section.id);
    if (bucket) bucket.push(field);
    else buckets.set(section.id, [field]);
  }
  return SECTIONS.filter((s) => buckets.get(s.id)?.length).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    fields: buckets.get(s.id)!,
  }));
}

/** `http_cache.index_max_age` → "Index max age". */
export function humanKey(key: string): string {
  const last = key.slice(key.lastIndexOf('.') + 1).replace(/[_-]/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** A value as prose, for the plan table and the change log. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
