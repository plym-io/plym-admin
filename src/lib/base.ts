const match = window.location.pathname.match(/^(.*\/plym-admin)(\/|$)/);

/** Router basename — wherever the SPA is mounted ('/blog/plym-admin', '/admin', …). */
export const adminBase = match ? match[1] : '/admin';

/** Prefix for API calls — everything before '/plym-admin', '' on the legacy /admin mount. */
export const apiBase = match ? match[1].slice(0, -'/plym-admin'.length) : '';

/** A blog prefix in the one form worth comparing: '' at the root, '/news' otherwise. */
const normalizePrefix = (prefix: string) => {
  const mount = prefix.trim().replace(/^\/+|\/+$/g, '');
  return mount ? `/${mount}` : '';
};

const adminUrlForPrefix = (prefix: string) => {
  const { origin, pathname, search, hash } = window.location;
  const route = pathname.startsWith(adminBase) ? pathname.slice(adminBase.length) : '';
  return `${origin}${prefix}/plym-admin${route || '/'}${search}${hash}`;
};

/**
 * Where this panel and the gateway it talks to answer once the blog is mounted
 * somewhere else.
 *
 * Both are served from under the blog's own prefix, so changing that prefix
 * moves them: the page you are looking at stops existing the moment the deploy
 * lands, and so does the API it has been calling. Neither address comes back.
 *
 * Both are on the current origin, deliberately. A blog can be moved onto a
 * domain the owner owns, and the gateway will name an `admin_url` there — but
 * that address is only as reachable as the proxy the owner configured by hand,
 * and the session this panel holds is scoped to the origin it was issued on.
 * Sending someone to their own domain would be a guess that costs them their
 * login; the origin is where the panel is certain to answer.
 */
export interface PanelMove {
  /** This panel's address afterwards, on the route it is on now. */
  adminUrl: string;
  /** The gateway's base afterwards — where an operation in flight can be followed. */
  cloudBase: string;
}

/**
 * The move a blog prefix of `prefix` would be, or null when the panel is
 * already there. A prefix that resolves to where we stand is not a move, however
 * it was written: '/news', 'news' and '/news/' are the same address.
 */
export function panelMove(prefix: string): PanelMove | null {
  const next = normalizePrefix(prefix);
  if (next === apiBase) return null;
  return { adminUrl: adminUrlForPrefix(next), cloudBase: `${next}/cloud` };
}

/**
 * Public URL of a rendered post. Always build these from the server's `path`,
 * never from `slug` — a categorised post lives at "<category>/<slug>", so a
 * slug-only URL 404s for every post that has a category.
 */
export const liveUrl = (path: string) => `${apiBase}/${path.replace(/^\/+/, '')}`;

/**
 * URL for a file in `public/`, resolved the same way index.html resolves the
 * favicon. A root-absolute '/logo.svg' would 404 — the SPA is never mounted at
 * the origin root. In dev BASE_URL is '/admin/'; in the build it's './', which
 * the `<base href>` the server injects resolves against the admin mount.
 */
export const asset = (name: string) =>
  `${import.meta.env.BASE_URL}${name.replace(/^\//, '')}`;
