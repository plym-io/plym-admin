import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowClockwise,
  Check,
  DownloadSimple,
  Lock,
  Storefront,
} from '@phosphor-icons/react';
import { getTemplates, installTemplate } from '@/api/cloud';
import { isApiError, type ApiError } from '@/api/errors';
import type { TemplateCatalog, TemplateSource } from '@/types/cloud';
import { Panel, PanelHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OpProgress, type OpOutcome } from '@/components/cloud/OpProgress';
import { cn } from '@/lib/classnames';

/** One row of the catalogue: a name, and what can be done with it here. */
interface Entry {
  name: string;
  source: TemplateSource;
  installed: boolean;
  active: boolean;
}

/**
 * Fold the gateway's four lists into the one list a person reads. A name can
 * appear in both `public` and `private`; the tenant's own registry wins,
 * because that is the copy they control.
 */
export function catalogEntries(catalog: TemplateCatalog): Entry[] {
  const seen = new Map<string, Entry>();
  const add = (name: string, source: TemplateSource) => {
    if (seen.has(name)) return;
    seen.set(name, {
      name,
      source,
      installed: catalog.available.includes(name),
      active: catalog.active === name,
    });
  };
  catalog.private.forEach((n) => add(n, 'private'));
  catalog.public.forEach((n) => add(n, 'public'));
  // Installed but no longer offered by either registry — still selectable.
  catalog.available.forEach((n) => add(n, 'public'));
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface Props {
  /** The draft value of the `template` setting, so selection stays in the form. */
  value: string;
  onSelect: (name: string) => void;
  /** Re-read the settings document once an install lands. */
  onInstalled?: () => void;
}

/**
 * Install a template, then select it.
 *
 * Selecting is an ordinary settings edit — it joins the draft and goes out with
 * the next deploy. Installing is not: it fetches the template, restarts the
 * blog and re-renders every post, so it runs as its own operation with its own
 * log, right here, before there is anything to select.
 */
export function TemplatePicker({ value, onSelect, onInstalled }: Props) {
  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCatalog(await getTemplates());
      setError(null);
    } catch (e) {
      // An older gateway has no /templates at all. That's not a failure worth
      // shouting about — the select below still works off the settings doc.
      setError(isApiError(e) ? e.message : 'Could not load templates');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => (catalog ? catalogEntries(catalog) : []), [catalog]);

  const install = async (entry: Entry, update = false) => {
    setInstalling(entry.name);
    setOpId(null);
    try {
      const accepted = await installTemplate(entry.name, entry.source, { update });
      setOpId(accepted.op_id);
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

  if (error && !catalog) {
    return null;
  }

  return (
    <Panel flush>
      <PanelHeader
        title="Templates"
        description="Install one from a registry, then select it."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh templates"
            title="Refresh"
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <ArrowClockwise size={15} />
          </button>
        }
      />

      {!catalog ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">
          No templates offered for this blog.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => {
            const selected = value === entry.name;
            const busy = installing === entry.name;
            return (
              <div
                key={entry.name}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors',
                  selected ? 'bg-accent-soft/40' : 'hover:bg-bg-subtle',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    selected
                      ? 'bg-accent text-accent-fg'
                      : 'bg-bg-subtle text-fg-subtle',
                  )}
                >
                  {selected ? (
                    <Check size={15} weight="bold" />
                  ) : entry.source === 'private' ? (
                    <Lock size={14} />
                  ) : (
                    <Storefront size={14} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-fg">{entry.name}</p>
                  <p className="text-[11.5px] text-fg-subtle">
                    {entry.source === 'private' ? 'Your registry' : 'Public repo'}
                    {entry.active && ' · live'}
                  </p>
                </div>

                {entry.installed ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(installing)}
                      title="Refetch this template"
                      onClick={() => void install(entry, true)}
                    >
                      {busy ? 'Updating…' : 'Update'}
                    </Button>
                    <Button
                      variant={selected ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={selected}
                      onClick={() => onSelect(entry.name)}
                    >
                      {selected ? 'Selected' : 'Select'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={Boolean(installing)}
                    onClick={() => void install(entry)}
                  >
                    <DownloadSimple size={14} />
                    {busy ? 'Installing…' : 'Install'}
                  </Button>
                )}
              </div>
            );
          })}
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
