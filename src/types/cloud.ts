/**
 * Shapes returned by the plym-cloud tenant gateway, mounted alongside the panel
 * at `{prefix}/cloud`.
 *
 * That API declares almost every response as a bare `{}` in its OpenAPI
 * document, so these types are written from its prose rather than generated
 * from it — and they describe the *normalized* form `@/api/cloud` hands back,
 * not the wire shape. Only what the screens key off is required; the gateway is
 * free to send more, and the screens render what they are given.
 */

/** What applying a change costs, cheapest first. */
export type Impact = 'none' | 'reload' | 'rebuild' | 'reroute';

/** The lifecycle of an asynchronous operation. */
export type OpState = 'queued' | 'running' | 'succeeded' | 'failed';

/** Feature flags from `GET /capabilities` — unauthenticated. */
export type Capabilities = Record<string, unknown>;

/** One editable key, as described by `GET /settings`' `schema`. */
export interface SettingSchema {
  /** Dotted name, e.g. `colors.primary`. This is the key a patch is sent under. */
  key: string;
  /** `line`, `color`, `bool`, `int`, `enum`, `url`, `path`, `html`, `list`, … */
  kind: string;
  impact: Impact;
  /** Human-readable consequences of changing this key. */
  effects: string[];
  note?: string;
  label?: string;
  /** Options for `enum` kinds that carry their own; `template` uses `templates`. */
  choices?: string[];
}

export interface SettingsDocument {
  /** Current values, flattened to the same dotted keys the schema uses. */
  values: Record<string, unknown>;
  schema: SettingSchema[];
  /** Valid values for the `template` key. */
  templates: string[];
}

/** The 202 body every write answers with. */
export interface Accepted {
  op_id: string;
  verb: string;
  target: string | null;
  state: OpState | string;
}

/** One line of an operation's log. Free-form; `@/components/cloud` formats it. */
export type OpEvent = Record<string, unknown>;

export interface EventPage {
  op_id: string;
  events: OpEvent[];
  next_after: number;
  state: OpState | string;
  error?: Record<string, unknown> | null;
  exit_code?: number | null;
}

/** One resolved change from `POST /settings/plan`. */
export interface PlanChange {
  key: string;
  from: unknown;
  to: unknown;
}

export interface Plan {
  changes: PlanChange[];
  effects: string[];
  impact: Impact;
}

/** Where a blog is actually served. */
export interface Placement {
  host?: string;
  prefix?: string;
  url?: string;
}

export interface Strategy {
  id: string;
  label: string;
  summary?: string;
  /** False when this blog's placement rules the strategy out. */
  applicable: boolean;
  /** Why it can't be used, in plain language. Present when `applicable` is false. */
  blocked_reason?: string | null;
  /** The gateway's own word on how well it works — `native`, `best`, … */
  support?: string;
  recommended?: boolean;
}

export interface Gateway {
  id: string;
  label: string;
  description?: string;
  strategies: Strategy[];
}

export interface RoutingOptions {
  placement?: Placement;
  gateways: Gateway[];
  /** Which gateway/strategy to put in front of the user first. */
  recommended?: { gateway?: string; strategy?: string };
}

export interface GuideStep {
  title: string;
  body?: string;
  /** Copy-paste ready, already rendered against this blog's hostname. */
  snippet?: string | null;
  /** `customer` for work the site owner does, `plym` for what the platform does. */
  actor?: string;
}

export interface GuideCheck {
  command?: string;
  expect?: string;
  title?: string;
}

export interface GuideStrategy extends Strategy {
  steps: GuideStep[];
  checks: GuideCheck[];
  caveats: string[];
  requires: string[];
}

export interface Guide {
  gateway: string;
  label: string;
  placement?: Placement;
  strategies: GuideStrategy[];
}

/** One row of `GET /settings/changes`. */
export interface SettingsChange {
  key: string;
  from: unknown;
  to: unknown;
  at?: string;
  actor?: string;
  op_id?: string;
}

/** `GET /status` — where the blog is served and whether it is healthy. */
export interface TenantStatus {
  url?: string;
  prefix?: string;
  state?: string;
  running?: boolean;
  image?: string;
  admin_version?: string;
}
