import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  ArrowsClockwise,
  Check,
  DownloadSimple,
  Lock,
  Storefront,
} from '@phosphor-icons/react';
import { getTemplates, installTemplate } from '@/api/cloud';
import { isApiError, type ApiError } from '@/api/errors';
import type { SettingSchema, TemplateCatalog, TemplateSource } from '@/types/cloud';
import { Panel, PanelHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImpactBadge } from '@/components/cloud/ImpactBadge';
import { OpProgress, type OpOutcome } from '@/components/cloud/OpProgress';
import { cn } from '@/lib/classnames';

/** One template, and where another copy of it could still come from. */
export interface TemplateEntry {
  name: string;
  /** The registry offering it; null once neither one does. */
  source: TemplateSource | null;
}

/**
 * The catalogue as this screen reads it: what the blog has, and what it could
 * have. A name is never in both lists — installing moves it from one to the
 * other — because only an installed template can be selected, and a row that
 * offered both readings at once is what made this screen hard to read.
 */
export interface TemplateShelf {
  installed: TemplateEntry[];
  registry: TemplateEntry[];
}

const byName = (a: TemplateEntry, b: TemplateEntry) => a.name.localeCompare(b.name);

/**
 * Split the gateway's four lists in two. `installedNames` is the settings
 * document's own list of valid values, and it stands in for the whole
 * catalogue on a deployment too old to publish `/templates` — selecting still
 * works there, there is just nothing new to install.
 */
export function shelve(
  catalog: TemplateCatalog | null,
  installedNames: string[],
): TemplateShelf {
  // The tenant's own registry wins: that is the copy they control.
  const sourceOf = (name: string): TemplateSource | null =>
    catalog?.private.includes(name)
      ? 'private'
      : catalog?.public.includes(name)
        ? 'public'
        : null;

  const have = new Set(catalog?.available ?? installedNames);
  const registry = new Map<string, TemplateEntry>();
  for (const name of [...(catalog?.private ?? []), ...(catalog?.public ?? [])]) {
    if (have.has(name) || registry.has(name)) continue;
    registry.set(name, { name, source: sourceOf(name) });
  }

  return {
    installed: [...have].map((name) => ({ name, source: sourceOf(name) })).sort(byName),
    registry: [...registry.values()].sort(byName),
  };
}

function sourceLabel(source: TemplateSource | null): string {
  if (source === 'private') return 'Your registry';
  if (source === 'public') return 'Public repo';
  return 'Installed here';
}

interface Props {
  /** The `template` key as the gateway describes it — what a change costs. */
  field?: SettingSchema;
  /** Valid values from the settings document. */
  installed: string[];
  /** The template rendering the blog right now. */
  live: string;
  /** The draft value, so a selection stays in the form until Deploy. */
  value: string;
  onSelect: (name: string) => void;
  /** Re-read the settings document once an install lands. */
  onInstalled?: () => void;
}

/**
 * The whole of the Template setting: install one from a registry, then select
 * it.
 *
 * Selecting is an ordinary settings edit — it joins the draft and goes out with
 * the next deploy. Installing is not: it fetches the template, restarts the
 * blog and re-renders every post, so it runs as its own operation with its own
 * log, right here, before there is anything to select.
 */
export function TemplatePicker({
  field,
  installed,
  live,
  value,
  onSelect,
  onInstalled,
}: Props) {
  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCatalog(await getTemplates());
    } catch {
      // An older gateway has no /templates at all. That's not a failure worth
      // shouting about — the settings document still says what can be picked,
      // there is simply nothing new to install.
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shelf = useMemo(() => shelve(catalog, installed), [catalog, installed]);
  const dirty = value !== live;

  const install = async (name: string, source: TemplateSource, update = false) => {
    setInstalling(name);
    setOpId(null);
    try {
      setOpId((await installTemplate(name, source, { update })).op_id);
    } catch (e) {
      const err = e as ApiError & { remedy?: string | null };
      toast.error(isApiError(e) ? err.message : 'Could not start the install', {
        description: err?.remedy ?? undefined,
      });
      setInstalling(null);
    }
  };

  const settled = (outcome: OpOutcome) => {
    const name = installing;
    setInstalling(null);
    if (outcome === 'succeeded') {
      toast.success(name ? `${name} installed.` : 'Template installed.');
    } else if (outcome === 'failed') {
      toast.error('The install did not finish.');
      return;
    } else {
      // Installing restarts the blog, so losing sight of it says nothing about
      // how it ended. The catalogue knows; ask it rather than guess.
      toast('Lost sight of the install while the blog restarted.');
    }
    void load();
    onInstalled?.();
  };

  return (
    <Panel flush>
      <PanelHeader
        title={field?.label ?? 'Template'}
        description="Only an installed template can be selected. Install one from a registry, then select it."
        actions={
          <>
            {dirty && field && <ImpactBadge impact={field.impact} />}
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh the template list"
              title="Refresh the list"
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <ArrowsClockwise size={15} />
            </button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : shelf.installed.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">
          {shelf.registry.length
            ? 'Nothing installed yet. Install one below, then select it.'
            : 'No templates offered for this blog.'}
        </p>
      ) : (
        <div className="divide-y divide-border" role="radiogroup" aria-label="Installed templates">
          {shelf.installed.map((entry) => {
            const selected = value === entry.name;
            const busy = installing === entry.name;
            return (
              <div
                key={entry.name}
                className={cn(
                  'flex items-center transition-colors',
                  selected ? 'bg-accent-soft/40' : 'hover:bg-bg-subtle',
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelect(entry.name)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span
                    className={cn(
                      // Round, because exactly one of these can be true — a
                      // square box reads as a list you can tick several of.
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      selected
                        ? 'bg-accent text-accent-fg'
                        : 'border border-border-strong bg-bg',
                    )}
                  >
                    {selected && <Check size={15} weight="bold" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-mono text-[13px] text-fg">
                        {entry.name}
                      </span>
                      {entry.name === live && (
                        <span className="shrink-0 rounded-pill border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                          Live
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-fg-subtle">
                      {sourceLabel(entry.source)}
                    </span>
                  </span>
                </button>

                {/* Only a template a registry still offers can be refetched. */}
                {entry.source && (
                  <button
                    type="button"
                    disabled={Boolean(installing)}
                    onClick={() => void install(entry.name, entry.source!, true)}
                    aria-label={`Fetch ${entry.name} again`}
                    title="Fetch this template again from its registry"
                    className="mr-3 shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40"
                  >
                    <ArrowClockwise size={14} className={busy ? 'animate-spin' : undefined} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {shelf.registry.length > 0 && (
        <>
          <p className="border-y border-border bg-bg-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Install from a registry
          </p>
          <div className="divide-y divide-border">
            {shelf.registry.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-subtle">
                  {entry.source === 'private' ? <Lock size={14} /> : <Storefront size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-fg">{entry.name}</p>
                  <p className="text-[11.5px] text-fg-subtle">{sourceLabel(entry.source)}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={Boolean(installing)}
                  onClick={() => entry.source && void install(entry.name, entry.source)}
                >
                  <DownloadSimple size={14} />
                  {installing === entry.name ? 'Installing…' : 'Install'}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {dirty && field && field.effects.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          {field.effects.map((e) => (
            <p key={e} className="text-[12.5px] text-fg-muted">
              {e}
            </p>
          ))}
        </div>
      )}

      {opId && (
        <div className="border-t border-border p-4">
          <p className="mb-2 text-[12.5px] text-fg-muted">
            Installing restarts the blog and re-renders every post.
          </p>
          <OpProgress opId={opId} onSettled={settled} />
        </div>
      )}
    </Panel>
  );
}
