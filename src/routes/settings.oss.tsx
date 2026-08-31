import { useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, BookOpen, CaretDown, FileText, ListDashes } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { NAV_SLOTS, NAV_SLOT_LABEL, isMenu, readDrafts } from '@/lib/nav-links';
import { flatten, humanKey, sectionsFor } from '@/lib/settings';
import type { SiteConfig } from '@/types';
import { Page, PageHeader, Panel, PanelHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Snippet } from '@/components/cloud/Snippet';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { NavLinksModal } from '@/components/settings/NavLinksModal';

const DOCS_URL = 'https://plym.io/docs/configuration/basics';

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * The `links:` block, read off the document rather than off `SiteConfig`: it is
 * newer than the checked-in OpenAPI snapshot. Its absence is the meaningful
 * case — a blog whose plym predates the feature renders no navigation whatever
 * the file says, so the panel below stays away rather than offering to
 * configure something that would be ignored.
 */
function navLinksOf(config: SiteConfig): unknown | undefined {
  return 'links' in config ? (config as { links?: unknown }).links : undefined;
}

/**
 * Settings on a self-hosted blog: everything the site is running, laid out the
 * same way the cloud panel lays it out, and read-only. `config.yaml` on the
 * server is the source of truth — a form that edited it from here would be one
 * more place for the two to disagree.
 */
export default function OssSettings() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('general');
  const [linksOpen, setLinksOpen] = useState(false);

  useEffect(() => {
    call(api.GET('/api/config'))
      .then(setConfig)
      .catch((e) =>
        setError(isApiError(e) ? e.message : 'Could not load configuration'),
      )
      .finally(() => setLoading(false));
  }, []);

  // Same dotted keys and same sections as the cloud screen, so the two
  // editions are recognisably one product rather than two panels.
  const sections = useMemo(() => {
    if (!config) return [];
    const entries = Object.entries(flatten(config)).map(([key, value]) => ({
      key,
      value,
    }));
    return sectionsFor(entries);
  }, [config]);

  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === active)) {
      setActive(sections[0].id);
    }
  }, [sections, active]);

  const current = sections.find((s) => s.id === active) ?? sections[0];
  const navLinks = config ? navLinksOf(config) : undefined;
  const nav = useMemo(() => readDrafts(navLinks), [navLinks]);

  return (
    <Page width="wide">
      <PageHeader
        title="Settings"
        description="What this blog is running. Read-only — edit config.yaml on the server to change it."
        actions={
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[13px] font-medium text-fg-muted shadow-xs transition-colors hover:border-border-strong hover:text-fg"
          >
            <BookOpen size={14} /> Configuration docs
            <ArrowSquareOut size={12} />
          </a>
        }
      />

      {loading ? (
        <div className="mt-6 grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <Skeleton className="h-56 w-full" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <Panel className="mt-6 border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{error}</p>
        </Panel>
      ) : (
        <div className="mt-6 grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <SettingsNav
            sections={sections}
            active={current?.id ?? ''}
            onSelect={setActive}
          />

          <div className="min-w-0 space-y-5">
            {current && (
              <Panel flush>
                <PanelHeader title={current.title} description={current.description} />
                <dl className="divide-y divide-border">
                  {current.fields.map((field) => (
                    <div
                      key={field.key}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start gap-x-6 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <dt className="text-[13.5px] font-medium text-fg">
                          {humanKey(field.key)}
                        </dt>
                        <p className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">
                          {field.key}
                        </p>
                      </div>
                      <dd className="min-w-0 break-words text-right font-mono text-[13px] text-fg-muted">
                        {renderValue(field.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}

            {current?.id === 'advanced' && navLinks !== undefined && (
              <Panel flush>
                <PanelHeader
                  title="Header & footer links"
                  description="The navigation this blog renders around every page."
                  actions={
                    <Button size="sm" onClick={() => setLinksOpen(true)}>
                      <ListDashes size={14} /> Configure
                    </Button>
                  }
                />
                <dl className="divide-y divide-border">
                  {NAV_SLOTS.map((slot) => (
                    <div
                      key={slot}
                      className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-x-6 px-4 py-3"
                    >
                      <dt className="text-[13.5px] font-medium text-fg">
                        {NAV_SLOT_LABEL[slot]}
                      </dt>
                      <dd className="min-w-0 text-[13px] text-fg-muted">
                        {nav[slot].length === 0 ? (
                          <span className="text-fg-subtle">
                            Nothing configured — shows just the blog name.
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            {nav[slot].map((item) => (
                              <span
                                key={item.id}
                                className="inline-flex items-center gap-1 rounded-md bg-bg-muted px-2 py-0.5"
                              >
                                {item.text}
                                {isMenu(item) && (
                                  <>
                                    <CaretDown size={11} aria-hidden="true" />
                                    <span className="text-fg-subtle tabular-nums">
                                      {item.children.length}
                                    </span>
                                  </>
                                )}
                              </span>
                            ))}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}

            <Panel flush>
              <PanelHeader
                title="Changing these"
                description="config.yaml sits at the root of your blog directory."
                actions={<FileText size={15} className="text-fg-subtle" />}
              />
              <div className="space-y-3 p-5">
                <Snippet
                  filename="config.yaml"
                  code={`# edit the file, then apply it
plym reload    # runtime-only changes: http_cache, pagination, robots, media
plym rebuild   # anything that changes rendered HTML: template, prism, reading, logo`}
                />
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                >
                  {DOCS_URL} <ArrowSquareOut size={12} />
                </a>
              </div>
            </Panel>
          </div>
        </div>
      )}

      <NavLinksModal
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        links={navLinks}
      />
    </Page>
  );
}
