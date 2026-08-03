import { apiBase } from '@/lib/base';
import { freshAccessToken, renewSession } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import type { OpenApiDocument } from '@/lib/openapi';

/**
 * Finding the blog's OpenAPI document, which is not in one fixed place.
 *
 * plym serves it at `/api/openapi.json`, behind the same bearer token as the
 * rest of the API — it is an authenticated route, not a public one, so an
 * anonymous fetch gets a 401 rather than a spec. Older deployments don't have
 * that route at all and only expose the document when the API is running in
 * debug, at `/plym-docs/openapi.json`. Both are tried, newest first.
 */
export const SPEC_URLS = [
  `${apiBase}/api/openapi.json`,
  `${apiBase}/openapi.json`,
  `${apiBase}/plym-docs/openapi.json`,
];

/** A body is only a spec if it says so — see `fetchSpec` for why this matters. */
export function isSpec(body: unknown): body is OpenApiDocument {
  const doc = body as OpenApiDocument | null;
  return Boolean(doc?.openapi && doc?.paths);
}

async function get(url: string, token: string | null): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { headers });
}

/**
 * The first candidate that answers with a real OpenAPI document, or null.
 *
 * Two things make this fussier than one `fetch`. The SPA's own `index.html` is
 * served for unknown paths, so a 200 that isn't JSON — or is JSON but isn't a
 * spec — has to be rejected and the next candidate tried; a 200 is not proof.
 * And plym answers a spent token with 403 as readily as 401, so both get one
 * retry behind a refresh, the same rule the rest of the clients follow.
 */
export async function fetchSpec(): Promise<OpenApiDocument | null> {
  for (const url of SPEC_URLS) {
    try {
      let res = await get(url, await freshAccessToken());
      if (res.status === 401 || res.status === 403) {
        if (await renewSession()) {
          res = await get(url, useAuthStore.getState().accessToken);
        }
      }
      if (!res.ok) continue;
      const body = (await res.json()) as unknown;
      if (isSpec(body)) return body;
    } catch {
      // Not JSON, or the request never landed. Either way, try the next one.
    }
  }
  return null;
}
