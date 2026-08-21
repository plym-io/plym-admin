import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { applySettings, getTemplates, installTemplate, type CloudError } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { liveUrl } from '@/lib/base';
import type { SettingSchema, TemplateCatalog, TemplateSource } from '@/types/cloud';
import { Panel, PanelHeader, PanelList } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OpProgress, type OpOutcome } from '@/components/cloud/OpProgress';

/**
 * The templates on offer, by where they come from. A name belongs to exactly
 * one list, so the section a row sits in is also the registry to install it
 * from.
 */
export interface TemplateShelf {
  public: string[];
  private: string[];
}

/**
 * The two lists the gateway publishes, plus the template rendering the blog
 * right now — which is pinned into the public list when neither registry
 * offers it any more, so that the blog's current template is never a thing the
 * screen fails to mention.
 *
 * `installedNames` is the settings document's own list of valid values, and it
 * stands in for the whole catalogue on a deployment too old to publish
 * `/templates`.
 */
export function shelve(
  catalog: TemplateCatalog | null,
  live: string,
  installedNames: string[],
): TemplateShelf {
  const priv = new Set(catalog?.private ?? []);
  // The tenant's own registry wins: that is the copy they control.
  const pub = new Set((catalog ? catalog.public : installedNames).filter((n) => !priv.has(n)));
  if (live && !priv.has(live)) pub.add(live);

  const sorted = (names: Set<string>) => [...names].sort((a, b) => a.localeCompare(b));
  return { public: sorted(pub), private: sorted(priv) };
}

/**
 * Templates whose files this blog already holds. One of these is switched to
 * directly; anything else has to be fetched first, and that is a second
 * restart nobody should pay for twice.
 */
export function fetchedNames(
  catalog: TemplateCatalog | null,
  installedNames: string[],
): Set<string> {
  return new Set([...(catalog?.available ?? []), ...installedNames]);
}

/** Which half of the job is running: fetch the files, then switch the blog. */
type Phase = 'fetching' | 'switching';

interface Props {
  /** The `template` key as the gateway describes it — its label, if it has one. */
  field?: SettingSchema;
  /** Valid values from the settings document. */
  installed: string[];
  /** The template rendering the blog right now. */
  live: string;
  /** Re-read the settings document once the blog is on a different template. */
  onChanged?: () => void;
}

/**
 * The whole of the Template setting: one list per registry, one Install button
 * per row, and the row already live has nothing to press.
 *
 * Install is the whole job, not the first half of it. It fetches the template
 * when the blog doesn't have it yet and then makes it the blog's template — so
 * unlike every other setting on this screen, it does not join the draft and
 * wait for Deploy. There is nothing to batch it with: a template is the one
 * change you make on its own and then go and look at.
 */
export function TemplatePicker({ field, installed, live, onChanged }: Props) {
  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [opId, setOpId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<TemplateCatalog | null> => {
    let next: TemplateCatalog | null = null;
    try {
      next = await getTemplates();
    } catch {
      // An older gateway has no /templates at all. That's not a failure worth
      // shouting about — the settings document still says what is installed.
    }
    setCatalog(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shelf = useMemo(() => shelve(catalog, live, installed), [catalog, live, installed]);
  const fetched = useMemo(() => fetchedNames(catalog, installed), [catalog, installed]);

  const stop = () => {
    setTarget(null);
    setPhase(null);
    setOpId(null);
  };

  const cannotStart = (e: unknown, fallback: string) => {
    const err = e as CloudError;
    toast.error(isApiError(e) ? err.message : fallback, {
      description: err?.remedy ?? undefined,
    });
    stop();
  };

  const switchTo = async (name: string) => {
    setPhase('switching');
    setOpId(null);
    try {
      setOpId((await applySettings({ template: name })).op_id);
    } catch (e) {
      cannotStart(e, 'Could not switch template');
    }
  };

  const install = async (name: string, source: TemplateSource) => {
    setTarget(name);
    if (fetched.has(name)) {
      await switchTo(name);
      return;
    }
    setPhase('fetching');
    setOpId(null);
    try {
      setOpId((await installTemplate(name, source)).op_id);
    } catch (e) {
      cannotStart(e, 'Could not start the install');
    }
  };

  const settled = async (outcome: OpOutcome) => {
    const name = target;
    const at = phase;
    if (!name || !at) return;

    if (outcome === 'failed') {
      toast.error(
        at === 'fetching'
          ? `${name} could not be installed.`
          : `Your blog is still on ${live}.`,
      );
      stop();
      void load();
      onChanged?.();
      return;
    }

    // Both halves restart the blog, so losing sight of one says nothing about
    // how it ended. The catalogue knows; ask it rather than guess.
    const fresh = await load();
    const landed =
      outcome === 'succeeded' ||
      (at === 'fetching' ? (fresh?.available ?? []).includes(name) : fresh?.active === name);

    if (!landed) {
      toast('Lost sight of your blog while it restarted.');
      stop();
      onChanged?.();
      return;
    }

    if (at === 'fetching') {
      await switchTo(name);
      return;
    }

    stop();
    onChanged?.();
    toast.success('Template updated.', {
      action: {
        label: 'View site',
        onClick: () => window.open(liveUrl(''), '_blank', 'noopener,noreferrer'),
      },
    });
  };

  const rows = (names: string[], source: TemplateSource) =>
    names.map((name) => (
      <div key={name} className="flex items-center gap-3 px-5 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{name}</span>
        {name === live && (
          <span className="shrink-0 rounded-pill border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Live
          </span>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={name === live || Boolean(target)}
          onClick={() => void install(name, source)}
        >
          {target === name ? 'Installing…' : 'Install'}
        </Button>
      </div>
    ));

  const heading = (text: string) => (
    <p className="border-y border-border bg-bg-subtle px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
      {text}
    </p>
  );

  return (
    <Panel flush>
      <PanelHeader
        title={field?.label ?? 'Template'}
        description="Installing one makes it live: your blog restarts and every post is re-rendered."
      />

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : shelf.public.length === 0 && shelf.private.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">
          No templates offered for this blog.
        </p>
      ) : (
        <>
          {shelf.public.length > 0 && (
            <>
              {heading('Public')}
              <PanelList>{rows(shelf.public, 'public')}</PanelList>
            </>
          )}
          {/* Only plym cloud has one, and only a tenant who has put something
              in theirs has anything to show here. */}
          {shelf.private.length > 0 && (
            <>
              {heading('Private registry')}
              <PanelList>{rows(shelf.private, 'private')}</PanelList>
            </>
          )}
        </>
      )}

      {target && (
        <div className="border-t border-border p-5">
          <p className="mb-2 text-[12.5px] text-fg-muted">
            {phase === 'fetching'
              ? `Fetching ${target} from its registry.`
              : `Switching your blog to ${target}.`}
          </p>
          {opId && <OpProgress key={opId} opId={opId} onSettled={(o) => void settled(o)} />}
        </div>
      )}
    </Panel>
  );
}
