import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { SiteConfig } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// One-line plain-English descriptions for each config section.
const DESCRIPTIONS: Record<string, string> = {
  Site: 'How your blog introduces itself to readers and search engines.',
  fonts: 'Typefaces used across the rendered blog.',
  colors: "The blog's color palette.",
  prism: 'Syntax highlighting for code blocks.',
  pagination: 'How many posts appear per page.',
  reading: 'How reading-time estimates are calculated.',
  backup: 'Automated backup behaviour.',
  media: 'Upload limits and the format images are converted to.',
  http_cache: 'Cache headers for served assets.',
  robots: 'What search engines are allowed to crawl.',
};

// Top-level scalar keys grouped under a synthetic "Site" section.
const SITE_KEYS = [
  'name',
  'website',
  'blog_home',
  'blog_prefix',
  'template',
  'logo',
  'favicon',
] as const;

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Section({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;
  return (
    <section>
      <h2 className="text-[15px] font-semibold capitalize tracking-tight text-fg">
        {title.replace(/_/g, ' ')}
      </h2>
      {DESCRIPTIONS[title] && (
        <p className="mt-0.5 text-sm text-fg-muted">{DESCRIPTIONS[title]}</p>
      )}
      <dl className="mt-3 overflow-hidden rounded-lg border border-border">
        {entries.map(([key, value], i) => (
          <div
            key={key}
            className={[
              'flex items-center justify-between gap-4 px-4 py-2.5',
              i % 2 === 1 ? 'bg-bg-subtle' : 'bg-bg',
            ].join(' ')}
          >
            <dt className="font-mono text-[13px] text-fg-muted">{key}</dt>
            <dd className="truncate font-mono text-[13px] text-fg">
              {renderValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Rebuilds the blog's search index on demand. The API regenerates it on publish,
 * so this is a repair hatch for when the index drifts from the posts.
 */
function SearchIndexCard() {
  const [busy, setBusy] = useState(false);

  const rebuild = async () => {
    setBusy(true);
    try {
      const res = await call(api.POST('/api/index', {}));
      toast.success(
        `Search index rebuilt — ${res.documents} ${
          res.documents === 1 ? 'document' : 'documents'
        }.`,
      );
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not rebuild the search index');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 flex items-center gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">
          Search index
        </h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Rebuild the index that powers search on your blog.
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() => void rebuild()}
        disabled={busy}
        className="shrink-0"
      >
        <MagnifyingGlass size={16} /> {busy ? 'Rebuilding…' : 'Rebuild'}
      </Button>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call(api.GET('/api/config'))
      .then(setConfig)
      .catch((e) =>
        setError(isApiError(e) ? e.message : 'Could not load configuration'),
      )
      .finally(() => setLoading(false));
  }, []);

  // Split the config into the synthetic "Site" group + each nested object.
  const sections = config
    ? [
        {
          title: 'Site',
          values: Object.fromEntries(
            SITE_KEYS.map((k) => [k, (config as Record<string, unknown>)[k]]),
          ),
        },
        ...Object.entries(config)
          .filter(
            ([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v),
          )
          .map(([title, values]) => ({
            title,
            values: values as Record<string, unknown>,
          })),
      ]
    : [];

  return (
    <Page width="text">
      <PageHeader title="Settings" />

      <SearchIndexCard />

      {loading ? (
        <div className="mt-8 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="mt-8 text-sm text-danger">{error}</p>
      ) : (
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <Section key={s.title} title={s.title} values={s.values} />
          ))}
        </div>
      )}
    </Page>
  );
}
