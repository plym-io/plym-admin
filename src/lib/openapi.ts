/**
 * Just enough OpenAPI to render a reference from plym's own document.
 *
 * This is deliberately not a validator. It takes whatever `/openapi.json`
 * returns, resolves the `$ref`s it needs, and flattens the paths object into
 * the list of operations a reader actually scans — anything it doesn't
 * recognise is carried through as-is rather than dropped, because a spec the
 * panel can't fully model is still a spec worth showing.
 */

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
  /** Document-wide security, applied to any operation that declares none. */
  security?: unknown;
  [key: string]: unknown;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export const METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
];

export interface Parameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: unknown;
}

export interface ResponseEntry {
  status: string;
  description?: string;
  schema?: unknown;
  /** The media type the schema was taken from, when there is one. */
  mediaType?: string;
}

export interface Operation {
  id: string;
  method: HttpMethod;
  path: string;
  tag: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  /** True when this operation — or the document on its behalf — demands a token. */
  secured: boolean;
  parameters: Parameter[];
  requestBody?: { required: boolean; schema?: unknown; mediaType?: string };
  responses: ResponseEntry[];
}

export interface TagGroup {
  tag: string;
  operations: Operation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Follow a local `$ref` one hop. Remote refs and anything unresolvable come
 * back untouched — the renderer shows the ref string, which is more useful
 * than an empty box.
 */
export function resolveRef(doc: OpenApiDocument, node: unknown): unknown {
  if (!isRecord(node) || typeof node.$ref !== 'string') return node;
  const ref = node.$ref;
  if (!ref.startsWith('#/')) return node;
  let current: unknown = doc;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isRecord(current)) return node;
    current = current[segment];
  }
  return current ?? node;
}

/** The display name for a `$ref`, e.g. `#/components/schemas/Post` → `Post`. */
export function refName(node: unknown): string | null {
  if (!isRecord(node) || typeof node.$ref !== 'string') return null;
  return node.$ref.slice(node.$ref.lastIndexOf('/') + 1);
}

/** The first media type on a content map, preferring JSON. */
function pickContent(
  content: unknown,
): { mediaType: string; schema?: unknown } | undefined {
  if (!isRecord(content)) return undefined;
  const types = Object.keys(content);
  if (types.length === 0) return undefined;
  const mediaType =
    types.find((t) => t.includes('json')) ?? types[0];
  const entry = content[mediaType];
  return {
    mediaType,
    schema: isRecord(entry) ? entry.schema : undefined,
  };
}

function toParameters(doc: OpenApiDocument, raw: unknown): Parameter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => resolveRef(doc, p))
    .filter(isRecord)
    .map((p) => ({
      name: String(p.name ?? ''),
      in: String(p.in ?? 'query'),
      required: p.required === true,
      description: typeof p.description === 'string' ? p.description : undefined,
      schema: p.schema,
    }))
    .filter((p) => p.name);
}

/**
 * Whether an operation actually demands credentials.
 *
 * OpenAPI's default is open, not closed: an operation with no `security` of its
 * own inherits the document's, and a document with no `security` either asks
 * for nothing. plym declares `security` per operation and has no document-wide
 * requirement, so the routes that leave it out — login, refresh, the public
 * reads — are genuinely public, and a reference that stamped a bearer header on
 * all of them would be telling readers to send a token they may not have yet.
 *
 * An empty list is an explicit opt-out, and a `{}` inside a non-empty list means
 * "authentication is optional here" — both read as public.
 */
function isSecured(doc: OpenApiDocument, raw: Record<string, unknown>): boolean {
  const declared = Array.isArray(raw.security)
    ? raw.security
    : Array.isArray(doc.security)
      ? doc.security
      : [];
  return (
    declared.length > 0 &&
    !declared.some((requirement) => isRecord(requirement) && Object.keys(requirement).length === 0)
  );
}

function toResponses(raw: unknown): ResponseEntry[] {
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .map(([status, value]) => {
      const body = isRecord(value) ? value : {};
      const content = pickContent(body.content);
      return {
        status,
        description:
          typeof body.description === 'string' ? body.description : undefined,
        schema: content?.schema,
        mediaType: content?.mediaType,
      };
    })
    .sort((a, b) => a.status.localeCompare(b.status));
}

/**
 * Every operation in the document, in path order, each tagged. Operations with
 * no tag collect under "General" rather than vanishing.
 */
export function listOperations(doc: OpenApiDocument): Operation[] {
  const out: Operation[] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};

  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    // Parameters declared once for the whole path apply to every method on it.
    const shared = toParameters(doc, item.parameters);

    for (const method of METHODS) {
      const raw = item[method];
      if (!isRecord(raw)) continue;

      const tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [];
      const content = pickContent(
        isRecord(raw.requestBody) ? raw.requestBody.content : undefined,
      );

      out.push({
        id: `${method}:${path}`,
        method,
        path,
        tag: (tags[0] as string) ?? 'General',
        summary: typeof raw.summary === 'string' ? raw.summary : undefined,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        deprecated: raw.deprecated === true,
        secured: isSecured(doc, raw),
        parameters: [...shared, ...toParameters(doc, raw.parameters)],
        requestBody: isRecord(raw.requestBody)
          ? {
              required: raw.requestBody.required === true,
              schema: content?.schema,
              mediaType: content?.mediaType,
            }
          : undefined,
        responses: toResponses(raw.responses),
      });
    }
  }
  return out;
}

/** Operations grouped by tag, tags in first-seen order. */
export function groupByTag(operations: Operation[]): TagGroup[] {
  const groups = new Map<string, Operation[]>();
  for (const op of operations) {
    const bucket = groups.get(op.tag);
    if (bucket) bucket.push(op);
    else groups.set(op.tag, [op]);
  }
  return [...groups.entries()].map(([tag, ops]) => ({ tag, operations: ops }));
}

/** Free-text match over the path, summary and tag. Empty query matches all. */
export function matchesQuery(op: Operation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    op.path.toLowerCase().includes(q) ||
    op.method.includes(q) ||
    op.tag.toLowerCase().includes(q) ||
    (op.summary ?? '').toLowerCase().includes(q)
  );
}

/**
 * A schema as a one-line type, the way a reader skims it: `string`,
 * `Post[]`, `integer · nullable`. Named refs keep their name — that's the
 * whole value of a component schema.
 */
export function typeLabel(doc: OpenApiDocument, schema: unknown, depth = 0): string {
  const named = refName(schema);
  if (named) return named;
  if (!isRecord(schema)) return 'any';
  if (depth > 6) return '…';

  // FastAPI writes optionals as anyOf: [T, null]; collapse that back to "T?".
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) {
    const parts = union.filter(
      (m) => !(isRecord(m) && m.type === 'null'),
    );
    const nullable = parts.length !== union.length;
    const label = parts.map((m) => typeLabel(doc, m, depth + 1)).join(' | ') || 'any';
    return nullable ? `${label} · nullable` : label;
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    return schema.allOf.map((m) => typeLabel(doc, m, depth + 1)).join(' & ');
  }
  if (schema.type === 'array') {
    return `${typeLabel(doc, schema.items, depth + 1)}[]`;
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  }
  if (typeof schema.type === 'string') {
    return schema.format ? `${schema.type} (${schema.format})` : schema.type;
  }
  if (isRecord(schema.properties)) return 'object';
  return 'any';
}

/** One property of an object schema, ready to list. */
export interface Field {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  /** Nested object/array-of-object fields, so the tree can be walked. */
  children?: Field[];
}

/**
 * An object schema flattened into its fields. Recurses into nested objects and
 * arrays of objects up to `maxDepth`, which stops a self-referential schema
 * from expanding forever.
 */
export function schemaFields(
  doc: OpenApiDocument,
  schema: unknown,
  depth = 0,
  maxDepth = 2,
): Field[] {
  const resolved = resolveRef(doc, schema);
  if (!isRecord(resolved)) return [];

  // Unwrap the containers that only ever hold the real shape.
  if (resolved.type === 'array') {
    return schemaFields(doc, resolved.items, depth, maxDepth);
  }
  if (Array.isArray(resolved.allOf)) {
    return resolved.allOf.flatMap((m) => schemaFields(doc, m, depth, maxDepth));
  }

  const properties = isRecord(resolved.properties) ? resolved.properties : null;
  if (!properties) return [];
  const required = new Set(
    Array.isArray(resolved.required) ? resolved.required.map(String) : [],
  );

  return Object.entries(properties).map(([name, raw]) => {
    const child = resolveRef(doc, raw);
    const nest =
      depth < maxDepth ? schemaFields(doc, raw, depth + 1, maxDepth) : [];
    return {
      name,
      type: typeLabel(doc, raw),
      required: required.has(name),
      description:
        isRecord(child) && typeof child.description === 'string'
          ? child.description
          : undefined,
      children: nest.length ? nest : undefined,
    };
  });
}
