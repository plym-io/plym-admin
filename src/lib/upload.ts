import { apiBase } from '@/lib/base';
import { freshAccessToken, renewSession } from '@/api/client';
import type { MediaItem } from '@/types';
import { readError, type ApiError } from '@/api/errors';

/**
 * Upload a file to POST /api/media with progress. openapi-fetch can't surface
 * upload progress, so we use XHR directly here (still same-origin, same auth).
 *
 * Going around `api` also means going around its auth middleware, so the
 * refresh-and-retry dance is repeated here by hand — otherwise dropping an
 * image into a tab that has been idle past the token's 15 minutes just fails.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<MediaItem> {
  try {
    return await send(file, await freshAccessToken(), onProgress);
  } catch (e) {
    if ((e as ApiError).status !== 401 || !(await renewSession())) throw e;
    return send(file, await freshAccessToken(), onProgress);
  }
}

function send(
  file: File,
  token: string | null,
  onProgress?: (fraction: number) => void,
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    xhr.open('POST', `${apiBase}/api/media`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as MediaItem);
        } catch {
          reject({
            code: 'parse_error',
            message: 'Upload succeeded but response was unreadable',
            status: xhr.status,
            raw: xhr.responseText,
          } satisfies ApiError);
        }
      } else if (xhr.status === 413) {
        reject({
          code: 'payload_too_large',
          message: 'File size exceeds max allowed limit for media uploads.',
          status: 413,
          raw: xhr.responseText,
        } satisfies ApiError);
      } else {
        const res = new Response(xhr.responseText, { status: xhr.status });
        reject(await readError(res));
      }
    };
    xhr.onerror = () =>
      reject({
        code: 'network',
        message: 'Upload failed — check your connection',
        status: 0,
        raw: null,
      } satisfies ApiError);

    xhr.send(form);
  });
}
