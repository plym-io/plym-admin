const match = window.location.pathname.match(/^(.*\/plym-admin)(\/|$)/);

/** Router basename — wherever the SPA is mounted ('/blog/plym-admin', '/admin', …). */
export const adminBase = match ? match[1] : '/admin';

/** Prefix for API calls — everything before '/plym-admin', '' on the legacy /admin mount. */
export const apiBase = match ? match[1].slice(0, -'/plym-admin'.length) : '';
