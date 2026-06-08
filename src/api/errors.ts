/** Normalized error shape used across the UI. */
export interface ApiError {
  code: string;
  message: string;
  status: number;
  raw: unknown;
}

/**
 * Plym returns errors as `{ detail: { code, message } }` for domain errors,
 * or `{ detail: [ValidationError, ...] }` for 422s. Normalize both.
 */
export async function normalizeError(res: Response): Promise<ApiError> {
  let raw: unknown = null;
  try {
    raw = await res.clone().json();
  } catch {
    /* non-JSON body */
  }

  const detail = (raw as { detail?: unknown } | null)?.detail;

  // Domain error: { code, message }
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as { code?: string; message?: string };
    return {
      code: d.code ?? `http.${res.status}`,
      message: d.message ?? res.statusText,
      status: res.status,
      raw,
    };
  }

  // Validation error: [{ loc, msg, type }]
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: (string | number)[] };
    const field = first.loc?.filter((p) => p !== 'body').join('.') ?? '';
    return {
      code: 'validation_error',
      message: field ? `${field}: ${first.msg}` : (first.msg ?? 'Invalid input'),
      status: res.status,
      raw,
    };
  }

  // Plain string detail or unknown.
  return {
    code: `http.${res.status}`,
    message:
      typeof detail === 'string' ? detail : res.statusText || 'Something went wrong',
    status: res.status,
    raw,
  };
}

/** Type guard for our normalized error. */
export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'message' in e &&
    'status' in e
  );
}
