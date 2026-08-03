import { api, call } from '@/api/client';
import type { Category, Faq, PostStatus } from '@/types';

/**
 * Taking your content out, and putting it back.
 *
 * plym has no bulk import/export endpoint, so a bundle is assembled from the
 * ordinary API a post at a time. That makes the format this file's business:
 * it is plain JSON, it names categories and FAQs rather than pointing at ids
 * that mean nothing on another blog, and it is written to be readable by a
 * person who has never seen plym.
 *
 * Media files are deliberately *not* embedded — a JSON file with megabytes of
 * base64 in it helps nobody. The bundle lists what is referenced so the images
 * can be moved separately.
 */

export const BUNDLE_VERSION = 1;

export interface BundlePost {
  title: string;
  slug: string;
  content: string;
  status: PostStatus;
  excerpt?: string | null;
  cover?: string | null;
  canonical_url?: string | null;
  weight?: number | null;
  /** Category *name*, not id. Created on import if it is missing. */
  category?: string | null;
  tags: string[];
  /** FAQ questions, matched or created on import. */
  faqs: string[];
  published_at?: string | null;
}

export interface Bundle {
  plym_bundle: number;
  exported_at: string;
  site?: { name?: string; website?: string };
  categories: { name: string; weight?: number | null }[];
  faqs: { question: string; answer: string }[];
  posts: BundlePost[];
  /** An index of what the posts reference. The files themselves aren't here. */
  media: { filename: string; url: string; mime_type: string; size_bytes: number }[];
}

export interface BundleCounts {
  posts: number;
  categories: number;
  faqs: number;
  media: number;
}

export function summarize(bundle: Bundle): BundleCounts {
  return {
    posts: bundle.posts.length,
    categories: bundle.categories.length,
    faqs: bundle.faqs.length,
    media: bundle.media.length,
  };
}

export function bundleFilename(siteName?: string): string {
  const slug = (siteName ?? 'plym')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'plym';
  return `${slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Read a bundle from a file, refusing anything that clearly isn't one. */
export function parseBundle(text: string): Bundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON.");
  }
  const b = raw as Partial<Bundle> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.posts)) {
    throw new Error("That doesn't look like a plym export — no posts in it.");
  }
  if (b.plym_bundle !== undefined && Number(b.plym_bundle) > BUNDLE_VERSION) {
    throw new Error(
      'That bundle was written by a newer version of plym than this panel understands.',
    );
  }
  const posts = b.posts.filter(
    (p): p is BundlePost => Boolean(p) && typeof p.title === 'string' && typeof p.slug === 'string',
  );
  if (posts.length === 0) throw new Error('No usable posts in that bundle.');
  return {
    plym_bundle: BUNDLE_VERSION,
    exported_at: typeof b.exported_at === 'string' ? b.exported_at : '',
    site: b.site,
    categories: Array.isArray(b.categories) ? b.categories : [],
    faqs: Array.isArray(b.faqs) ? b.faqs : [],
    posts: posts.map((p) => ({
      ...p,
      content: typeof p.content === 'string' ? p.content : '',
      status: p.status ?? 'draft',
      tags: Array.isArray(p.tags) ? p.tags : [],
      faqs: Array.isArray(p.faqs) ? p.faqs : [],
    })),
    media: Array.isArray(b.media) ? b.media : [],
  };
}

/** Run `work` over `items`, `limit` at a time, in order of completion. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await work(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/** The posts route allows 200 an page; media caps at 100. */
const PAGE_SIZE = 200;
const MEDIA_PAGE_SIZE = 100;

/** Every post on the blog, drafts included. */
async function allPosts() {
  const first = await call(
    api.GET('/api/posts', {
      params: { query: { page: 1, page_size: PAGE_SIZE, include_drafts: true } },
    }),
  );
  const pages = Math.ceil(first.total / (first.page_size || PAGE_SIZE));
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
    3,
    (page) =>
      call(
        api.GET('/api/posts', {
          params: { query: { page, page_size: PAGE_SIZE, include_drafts: true } },
        }),
      ),
  );
  return [first, ...rest].flatMap((p) => p.items);
}

/** Every uploaded file, as an index. The files themselves stay where they are. */
async function allMedia() {
  const first = await call(
    api.GET('/api/media', { params: { query: { page: 1, page_size: MEDIA_PAGE_SIZE } } }),
  );
  const pages = Math.ceil(first.total / (first.page_size || MEDIA_PAGE_SIZE));
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2),
    3,
    (page) =>
      call(
        api.GET('/api/media', {
          params: { query: { page, page_size: MEDIA_PAGE_SIZE } },
        }),
      ),
  );
  return [first, ...rest].flatMap((p) => p.items);
}

export interface ExportProgress {
  done: number;
  total: number;
}

/**
 * Collect the whole blog into one bundle. Post bodies only come back from the
 * single-post route, so this is one request per post — reported as it goes,
 * because on a large blog it is not instant.
 */
export async function exportBundle(
  onProgress: (progress: ExportProgress) => void,
): Promise<Bundle> {
  const [list, categories, faqs, media, config] = await Promise.all([
    allPosts(),
    call(api.GET('/api/categories')),
    call(api.GET('/api/faqs')),
    allMedia(),
    call(api.GET('/api/config')).catch(() => null),
  ]);

  let done = 0;
  onProgress({ done, total: list.length });

  const posts = await mapLimit(list, 4, async (item) => {
    const full = await call(
      api.GET('/api/posts/{post_id}', { params: { path: { post_id: item.id } } }),
    );
    onProgress({ done: ++done, total: list.length });
    return {
      title: full.title,
      slug: full.slug,
      content: full.content,
      status: full.status,
      excerpt: full.excerpt ?? null,
      cover: full.cover ?? null,
      canonical_url: full.canonical_url ?? null,
      weight: full.weight ?? null,
      category: full.category?.name ?? null,
      tags: (full.tags ?? []).map((t) => t.name),
      faqs: (full.faqs ?? []).map((f) => f.question),
      published_at: full.published_at ?? null,
    } satisfies BundlePost;
  });

  return {
    plym_bundle: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    site: config ? { name: config.name, website: config.website ?? undefined } : undefined,
    categories: categories.map((c) => ({ name: c.name, weight: c.weight ?? null })),
    faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
    posts,
    media: media.map((m) => ({
      filename: m.filename,
      url: m.url,
      mime_type: m.mime_type,
      size_bytes: m.size_bytes,
    })),
  };
}

export interface ImportResult {
  created: number;
  skipped: number;
  categories: number;
  faqs: number;
  failures: { slug: string; message: string }[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Write a bundle into this blog. Posts are matched on slug and an existing one
 * is left completely alone — importing twice adds nothing the second time, and
 * an import can never overwrite something already published here.
 */
export async function importBundle(
  bundle: Bundle,
  onProgress: (progress: ExportProgress) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    skipped: 0,
    categories: 0,
    faqs: 0,
    failures: [],
  };

  const [existingCategories, existingFaqs, existingPosts] = await Promise.all([
    call(api.GET('/api/categories')),
    call(api.GET('/api/faqs')),
    allPosts(),
  ]);

  const categoryId = new Map<string, number>(
    existingCategories.map((c: Category) => [norm(c.name), c.id]),
  );
  const faqId = new Map<string, number>(
    existingFaqs.map((f: Faq) => [norm(f.question), f.id]),
  );
  const taken = new Set(existingPosts.map((p) => p.slug));

  // Categories and FAQs first — a post needs their ids.
  const wantedCategories = new Map<string, { name: string; weight?: number | null }>();
  for (const c of bundle.categories) wantedCategories.set(norm(c.name), c);
  for (const p of bundle.posts) {
    if (p.category && !wantedCategories.has(norm(p.category))) {
      wantedCategories.set(norm(p.category), { name: p.category });
    }
  }
  for (const [key, c] of wantedCategories) {
    if (categoryId.has(key)) continue;
    try {
      const made = await call(
        api.POST('/api/categories', {
          body: { name: c.name, weight: c.weight ?? null },
        }),
      );
      categoryId.set(key, made.id);
      result.categories++;
    } catch {
      /* a post that wanted it simply lands uncategorised */
    }
  }

  const wantedFaqs = new Map<string, { question: string; answer: string }>();
  for (const f of bundle.faqs) wantedFaqs.set(norm(f.question), f);
  for (const [key, f] of wantedFaqs) {
    if (faqId.has(key)) continue;
    try {
      const made = await call(
        api.POST('/api/faqs', { body: { question: f.question, answer: f.answer } }),
      );
      faqId.set(key, made.id);
      result.faqs++;
    } catch {
      /* skip — the post keeps its other FAQs */
    }
  }

  let done = 0;
  onProgress({ done, total: bundle.posts.length });

  // Sequential on purpose: slugs and tags are created as a side effect, and
  // parallel writes to the same new tag race each other.
  for (const post of bundle.posts) {
    if (taken.has(post.slug)) {
      result.skipped++;
      onProgress({ done: ++done, total: bundle.posts.length });
      continue;
    }
    try {
      const created = await call(
        api.POST('/api/posts', {
          body: {
            title: post.title,
            slug: post.slug,
            content: post.content ?? '',
            excerpt: post.excerpt ?? null,
            cover: post.cover ?? null,
            canonical_url: post.canonical_url ?? null,
            weight: post.weight ?? null,
            category_id: post.category ? (categoryId.get(norm(post.category)) ?? null) : null,
            tags: post.tags ?? [],
            faqs: (post.faqs ?? [])
              .map((q) => faqId.get(norm(q)))
              .filter((id): id is number => typeof id === 'number'),
          },
        }),
      );
      // Posts are created as drafts; anything that was live stays live.
      if (post.status && post.status !== 'draft') {
        await call(
          api.PATCH('/api/posts/{post_id}', {
            params: { path: { post_id: created.id } },
            body: { status: post.status },
          }),
        );
      }
      taken.add(post.slug);
      result.created++;
    } catch (e) {
      result.failures.push({
        slug: post.slug,
        message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? 'failed'),
      });
    }
    onProgress({ done: ++done, total: bundle.posts.length });
  }

  return result;
}
