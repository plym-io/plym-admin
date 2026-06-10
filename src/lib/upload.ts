import { useAuthStore } from '@/store/auth';
import { apiBase } from '@/lib/base';
import type { MediaItem } from '@/types';
import { normalizeError, type ApiError } from '@/api/errors';

/**
 * Upload a file to POST /api/media with progress. openapi-fetch can't surface
 * upload progress, so we use XHR directly here (still same-origin, same auth).
 */
export function uploadMedia(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    xhr.open('POST', `${apiBase}/api/media`);
    const token = useAuthStore.getState().accessToken;
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
      } else {
        const res = new Response(xhr.responseText, { status: xhr.status });
        reject(await normalizeError(res));
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
