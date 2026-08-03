import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowCounterClockwise, GearSix, RocketLaunch } from '@phosphor-icons/react';
import { getSettings, getSettingsChanges } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import {
  buildPatch,
  displayValue,
  groupSchema,
  initialDraft,
  worstImpact,
} from '@/lib/settings';
import { relativeTime } from '@/lib/format';
import type { SettingsChange, SettingsDocument } from '@/types/cloud';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SettingField } from '@/components/cloud/SettingField';
import { ImpactBadge } from '@/components/cloud/ImpactBadge';
import { DeployModal } from '@/components/cloud/DeployModal';

/** Plain-English headings for the sections the gateway's keys fall into. */
const SECTION_NOTES: Record<string, string> = {
  Site: 'How your blog introduces itself, and which template renders it.',
  fonts: 'Typefaces used across the rendered blog.',
  colors: "The blog's colour palette.",
  prism: 'Syntax highlighting for code blocks.',
  pagination: 'How many posts appear per page.',
  reading: 'How reading-time estimates are calculated.',
  backup: 'Automated backup behaviour.',
  media: 'Where uploaded files are served from.',
  http_cache: 'Cache headers for served pages and assets.',
  robots: 'What search engines are allowed to crawl.',
  inject: 'Markup added to every rendered page.',
  mcp: 'The Model Context Protocol endpoint for this blog.',
};

/**
 * Settings on plym cloud: an editable form that touches nothing until you say
 * so. Every field is a draft in the browser; Deploy is the only thing that
 * reaches the blog, and it goes through one confirmation that spells out what
 * applying will cost. Nobody wants a colour picker that restarts a container
 * on each drag.
 */
export default function CloudSettings() {
  const [doc, setDoc] = useState<SettingsDocument | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SettingsChange[]>([]);
  const [deployOpen, setDeployOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getSettings();
      setDoc(next);
      setDraft(initialDraft(next.schema, next.values));
      setError(null);
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
    // The audit log is a nicety — an older gateway without it shouldn't take
    // the screen down with it.
    getSettingsChanges(8)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useMemo(
    () => (doc ? buildPatch(doc.schema, doc.values, draft) : {}),
    [doc, draft],
  );
  const dirty = Object.keys(patch);
  // What the pending batch will cost, before the gateway is asked — enough for
  // the badge on the deploy bar; the dialog replaces it with the real plan.
  const expected = useMemo(
    () => worstImpact((doc?.schema ?? []).filter((f) => f.key in patch).map((f) => f.impact)),
    [doc, patch],
  );

  const sections = doc ? groupSchema(doc.schema) : [];

  return (
    <Page width="text" className={dirty.length ? 'pb-28' : undefined}>
      <PageHeader
        title="Settings"
        description="Change anything here freely — nothing reaches your blog until you deploy."
      />

      {loading ? (
        <div className="mt-8 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="ghost" className="mt-2" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={GearSix}
          title="Nothing to configure."
          hint="This deployment didn't publish any editable settings."
        />
      ) : (
        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-[15px] font-semibold capitalize tracking-tight text-fg">
                {section.title.replace(/_/g, ' ')}
              </h2>
              {SECTION_NOTES[section.title] && (
                <p className="mt-0.5 text-sm text-fg-muted">
                  {SECTION_NOTES[section.title]}
                </p>
              )}
              <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg">
                {section.fields.map((field) => (
                  <SettingField
                    key={field.key}
                    field={field}
                    value={draft[field.key] ?? ''}
                    templates={doc?.templates ?? []}
                    dirty={dirty.includes(field.key)}
                    onChange={(value) =>
                      setDraft((d) => ({ ...d, [field.key]: value }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          {history.length > 0 && (
            <section>
              <h2 className="text-[15px] font-semibold tracking-tight text-fg">
                Recent changes
              </h2>
              <p className="mt-0.5 text-sm text-fg-muted">
                What has been deployed to this blog, newest first.
              </p>
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                {history.map((c, i) => (
                  <li
                    key={`${c.key}-${c.at ?? i}`}
                    className="flex items-baseline gap-3 px-4 py-2.5 text-[13px]"
                  >
                    <span className="shrink-0 font-mono text-[12.5px] text-fg-muted">
                      {c.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {displayValue(c.to)}
                    </span>
                    {c.actor && (
                      <span className="shrink-0 text-fg-subtle">{c.actor}</span>
                    )}
                    {c.at && (
                      <span className="shrink-0 text-fg-subtle" title={c.at}>
                        {relativeTime(c.at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* The deploy bar. It exists only when there is something to deploy, and
          it is the sole route from this screen to the live blog. */}
      <AnimatePresence>
        {dirty.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-6 pb-6"
          >
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-bg-subtle py-2 pl-4 pr-2 shadow-lg">
              <span className="text-[13px] text-fg">
                {dirty.length} unsaved {dirty.length === 1 ? 'change' : 'changes'}
              </span>
              <ImpactBadge impact={expected} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doc && setDraft(initialDraft(doc.schema, doc.values))}
              >
                <ArrowCounterClockwise size={15} /> Discard
              </Button>
              <Button variant="accent" size="sm" onClick={() => setDeployOpen(true)}>
                <RocketLaunch size={15} weight="fill" /> Deploy
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeployModal
        open={deployOpen}
        patch={patch}
        onClose={() => setDeployOpen(false)}
        onApplied={() => void load()}
      />
    </Page>
  );
}
