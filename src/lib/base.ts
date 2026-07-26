const match = window.location.pathname.match(/^(.*\/plym-admin)(\/|$)/);

/** Router basename — wherever the SPA is mounted ('/blog/plym-admin', '/admin', …). */
export const adminBase = match ? match[1] : '/admin';

/** Prefix for API calls — everything before '/plym-admin', '' on the legacy /admin mount. */
export const apiBase = match ? match[1].slice(0, -'/plym-admin'.length) : '';

/**
 * URL for a file in `public/`, resolved the same way index.html resolves the
 * favicon. A root-absolute '/logo.svg' would 404 — the SPA is never mounted at
 * the origin root. In dev BASE_URL is '/admin/'; in the build it's './', which
 * the `<base href>` the server injects resolves against the admin mount.
 */
export const asset = (name: string) =>
  `${import.meta.env.BASE_URL}${name.replace(/^\//, '')}`;
