const match = window.location.pathname.match(/^(.*\/plym-admin)(\/|$)/);

/** Router basename — wherever the SPA is mounted ('/blog/plym-admin', '/admin', …). */
export const adminBase = match ? match[1] : '/admin';

/** Prefix for API calls — everything before '/plym-admin', '' on the legacy /admin mount. */
export const apiBase = match ? match[1].slice(0, -'/plym-admin'.length) : '';

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
