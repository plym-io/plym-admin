import { z } from 'zod';

/** A single profile link. `type` is a platform slug (see {@link LINK_PLATFORMS}). */
export interface ProfileLink {
  type: string;
  url: string;
}

export interface LinkPlatform {
  /** Stable slug persisted in `ProfileLink.type`. */
  value: string;
  /** Human label shown in the picker. */
  label: string;
}

/**
 * Selectable link platforms, in display order. The first {@link TOP_COUNT} are
 * shown up front; the rest collapse under a "More…" affordance in the picker.
 * `value` is a stable lowercase slug — the label can change without breaking
 * stored data.
 */
export const LINK_PLATFORMS: LinkPlatform[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'website', label: 'Website' },
  { value: 'github', label: 'GitHub' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'wechat', label: 'WeChat' },
  { value: 'snapchat', label: 'Snapchat' },
  { value: 'threads', label: 'Threads' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Other' },
];

export const TOP_COUNT = 6;
export const TOP_PLATFORMS = LINK_PLATFORMS.slice(0, TOP_COUNT);
export const MORE_PLATFORMS = LINK_PLATFORMS.slice(TOP_COUNT);

export function platformLabel(value: string): string {
  return LINK_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

// Same structural rule as canonical URLs: a full http(s) URL, capped length.
const linkUrlSchema = z
  .string()
  .url('Enter a valid URL.')
  .max(2048, 'That URL is too long.')
  .refine((v) => /^https?:\/\//.test(v), 'Use an http:// or https:// URL.');

/** Validate one URL. Returns an error message, or `null` when valid. */
export function validateLinkUrl(raw: string): string | null {
  const result = linkUrlSchema.safeParse(raw.trim());
  return result.success ? null : result.error.issues[0]?.message ?? 'Invalid URL.';
}

export type NormalizeResult =
  | { ok: true; value: ProfileLink[] }
  | { ok: false; errors: Record<number, string> };

/**
 * Turn the working rows into a payload. Rows with a blank URL are treated as
 * unfinished and dropped silently. A row with a URL must have a platform and a
 * structurally-valid URL, otherwise it fails with a per-index error message.
 */
export function normalizeLinks(links: ProfileLink[]): NormalizeResult {
  const errors: Record<number, string> = {};
  const value: ProfileLink[] = [];

  links.forEach((link, i) => {
    const url = link.url.trim();
    if (url === '') return; // incomplete row — ignore
    if (!link.type) {
      errors[i] = 'Choose a platform.';
      return;
    }
    const err = validateLinkUrl(url);
    if (err) {
      errors[i] = err;
      return;
    }
    value.push({ type: link.type, url });
  });

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
