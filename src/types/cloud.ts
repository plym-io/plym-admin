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

/**
 * Where a blog sits — or where it is headed. When `destination` is true this
 * describes the address the owner asked for via `?home=`, not current state.
 */
export interface Placement {
  slug?: string;
  /** The blog's own plym hostname. This is what a proxy points upstream at. */
  origin_host?: string;
  origin_url?: string;
  /** The platform's own domain, e.g. `plym.space`. */
  platform_domain?: string;
  /** Public hostname — the owner's domain once connected. */
  public_host?: string;
  public_url?: string;
  /** Mount path, normalized; an empty string at the domain root. */
  prefix?: string;
  blog_home?: string;
  admin_url?: string;
  /** The hostname the subdomain recipes suggest. */
  subdomain_host?: string;
  at_root?: boolean;
  /** True once the public host is the owner's domain rather than plym's. */
  external_domain?: boolean;
  /** True when this renders a requested `home` instead of current state. */
  destination?: boolean;
}

/** A link out to the gateway's own documentation. */
export interface DocLink {
  title: string;
  url: string;
}

/** A block of text to paste somewhere, already rendered against real hosts. */
export interface Snippet {
  body: string;
  label?: string;
  /** Highlighting hint — `nginx`, `shell`, `json`, … */
  language?: string;
  /** Where it belongs, when it belongs in a file. */
  filename?: string | null;
}

export interface Strategy {
  id: string;
  /** `path-proxy`, `front-door`, `subdomain` or `native`. */
  kind?: string;
  label: string;
  summary?: string;
  /** `supported`, `advanced` or `not-recommended`. */
  support?: string;
  /** False when the chosen address rules this way of connecting out. */
  applicable: boolean;
  /** Why it can't be used, in plain language. Present when `applicable` is false. */
  blocked_reason?: string | null;
}

export interface Gateway {
  id: string;
  label: string;
  /** What kind of thing this is — the picker groups by it. */
  category?: string;
  summary?: string;
  /** False when none of this gateway's strategies fit the chosen address. */
  applicable: boolean;
  strategies: Strategy[];
  docs: DocLink[];
}

/** One family of ways to connect, described once for the whole catalogue. */
export interface RoutingKind {
  id: string;
  label: string;
  summary?: string;
}

export interface RoutingOptions {
  placement?: Placement;
  gateways: Gateway[];
  kinds: RoutingKind[];
  /** Which gateway/strategy to put in front of the user first, and why. */
  recommended?: { gateway?: string | null; strategy?: string; why?: string };
}

export interface GuideStep {
  title: string;
  detail?: string;
  /** Copy-paste ready, already rendered against this blog's real hostname. */
  snippet?: Snippet | null;
  /** `customer` in `steps`, `plym` in `platform`. */
  actor?: string;
}

export interface GuideCheck {
  command?: string;
  expect?: string;
  title?: string;
}

/** Closes the journey: apply it with `PUT /home` once the owner's steps are done. */
export interface Finish {
  title?: string;
  detail?: string;
  /** Send verbatim as `PUT /home`'s `url`. */
  home: string;
  /** Pass through to `PUT /home`; true only for subdomain strategies. */
  register_hostname: boolean;
}

export interface GuideStrategy extends Strategy {
  /** The site owner's work, in order. Never contains anything plym does. */
  steps: GuideStep[];
  /** plym's own side of it — shown as reassurance, never as a task. */
  platform: GuideStep[];
  finish?: Finish | null;
  /** Run these after the `PUT /home` op succeeds. */
  checks: GuideCheck[];
  requires: string[];
  caveats: string[];
  docs: DocLink[];
  register_hostname: boolean;
}

export interface Guide {
  gateway: string;
  label: string;
  category?: string;
  summary?: string;
  docs: DocLink[];
  placement?: Placement;
  /** The invariants any proxy in front of plym must honour. */
  contract: string[];
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

/** Where a template can be installed from. */
export type TemplateSource = 'public' | 'private';

/**
 * `GET /templates` — what this blog has, and what it could have.
 *
 * `available` is the set of valid values for the `template` setting;
 * `public`/`private` are what can still be fetched, from the shared repo and
 * from the tenant's own registry folder. A name in a source list but not in
 * `available` is an install; a name in `available` is a select.
 */
export interface TemplateCatalog {
  slug?: string;
  available: string[];
  active?: string | null;
  public: string[];
  private: string[];
  source?: string;
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
