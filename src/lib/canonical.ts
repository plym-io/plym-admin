import { z } from 'zod';

/**
 * Structural validation for a per-post canonical URL (FOLLOWUP_CANONICAL §form).
 * Empty is allowed and maps to `null`; otherwise it must be a full http(s) URL,
 * matching the backend pattern `^https?://.+` (max 2048 chars).
 */
export const canonicalSchema = z
  .string()
  .url('Enter a valid URL.')
  .max(2048, 'That URL is too long.')
  .refine((v) => /^https?:\/\//.test(v), 'Use an http:// or https:// URL.');

/**
 * Validate raw input. Returns the value to persist (`null` for empty) or an
 * error message. We deliberately don't check reachability — the URL may be
 * valid but not live yet.
 */
export function validateCanonical(
  raw: string,
): { value: string | null; error: null } | { value: null; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, error: null };
  const result = canonicalSchema.safeParse(trimmed);
  if (result.success) return { value: result.data, error: null };
  return { value: null, error: result.error.issues[0]?.message ?? 'Invalid URL.' };
}
