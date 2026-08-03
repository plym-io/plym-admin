const match = window.location.pathname.match(/^(.*\/plym-admin)(\/|$)/);

/** Router basename — wherever the SPA is mounted ('/blog/plym-admin', '/admin', …). */
export const adminBase = match ? match[1] : '/admin';

/** Prefix for API calls — everything before '/plym-admin', '' on the legacy /admin mount. */
export const apiBase = match ? match[1].slice(0, -'/plym-admin'.length) : '';

/**
 * Where this panel answers once the blog is mounted at `prefix` instead.
 *
 * The admin is served from under the blog's own mount, so changing the blog
 * prefix moves the panel with it — the page you are looking at stops existing
 * the moment the deploy lands, and so does the API it has been talking to. The
 * route inside the SPA survives the move, so it is carried across: someone who
 * was on Settings arrives on Settings.
 *
 * A blog mounted at the domain root ('' or '/') puts the panel at
 * '/plym-admin/'.
 */
export const adminUrlForPrefix = (prefix: string) => {
  const mount = prefix.trim().replace(/^\/+|\/+$/g, '');
  const { origin, pathname, search, hash } = window.location;
  const route = pathname.startsWith(adminBase) ? pathname.slice(adminBase.length) : '';
  return `${origin}${mount ? `/${mount}` : ''}/plym-admin${route || '/'}${search}${hash}`;
};

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
