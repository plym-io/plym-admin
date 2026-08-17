import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  GearSix,
  RocketLaunch,
} from '@phosphor-icons/react';
import { getSettings, getSettingsChanges } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import {
  buildPatch,
  displayValue,
  initialDraft,
  sectionsFor,
  toInput,
  worstImpact,
} from '@/lib/settings';
import { relativeTime } from '@/lib/format';
import type { SettingsChange, SettingsDocument } from '@/types/cloud';
import { Page, PageHeader, Panel, PanelHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SettingField } from '@/components/cloud/SettingField';
import { ImpactBadge } from '@/components/cloud/ImpactBadge';
import { DeployModal } from '@/components/cloud/DeployModal';
import { TemplatePicker } from '@/components/cloud/TemplatePicker';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { ContactFooter } from '@/components/settings/ContactFooter';

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
  const [active, setActive] = useState<string>('general');

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

  const sections = useMemo(
    () => (doc ? sectionsFor(doc.schema) : []),
    [doc],
  );

  // A section the deployment doesn't publish can't be the selected one.
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === active)) {
      setActive(sections[0].id);
    }
  }, [sections, active]);

  const current = sections.find((s) => s.id === active) ?? sections[0];
  // `template` isn't a form row — it has a panel of its own, because choosing
  // one and having one installed are the same question.
  const templateField = current?.fields.find((f) => f.key === 'template');
  const plainFields = (current?.fields ?? []).filter((f) => f !== templateField);
  const dirtyPerSection = useMemo(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.id, s.fields.filter((f) => f.key in patch).length]),
      ),
    [sections, patch],
  );

  return (
    <Page width="wide" className={dirty.length ? 'pb-28' : undefined}>
      <PageHeader title="Settings" />

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
          <Button variant="ghost" className="mt-2" onClick={() => void load()}>
            Try again
          </Button>
        </Panel>
      ) : sections.length === 0 ? (
        <Panel className="mt-6">
          <EmptyState
            icon={GearSix}
            title="Nothing to configure."
            hint="This deployment didn't publish any editable settings."
          />
        </Panel>
      ) : (
        <div className="mt-6 grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <SettingsNav
            sections={sections}
            active={current?.id ?? ''}
            onSelect={setActive}
            badges={dirtyPerSection}
          />

          <div className="min-w-0 space-y-5">
            {current && (
              <>
                {plainFields.length > 0 && (
                  <Panel flush>
                    <PanelHeader title={current.title} description={current.description} />
                    <div className="divide-y divide-border">
                      {plainFields.map((field) => (
                        <SettingField
                          key={field.key}
                          field={field}
                          value={draft[field.key] ?? ''}
                          dirty={dirty.includes(field.key)}
                          onChange={(value) =>
                            setDraft((d) => ({ ...d, [field.key]: value }))
                          }
                        />
                      ))}
                    </div>
                  </Panel>
                )}

                {/* The catalogue *is* the control for `template`: a select of
                    installed names beside a catalogue offering the same names
                    was two ways to say one thing, and neither said which of
                    them could actually be picked. */}
                {templateField && (
                  <TemplatePicker
                    field={templateField}
                    installed={doc?.templates ?? []}
                    live={String(toInput(templateField.kind, doc?.values.template) || '')}
                    value={String(draft.template ?? '')}
                    onSelect={(name) => setDraft((d) => ({ ...d, template: name }))}
                    onInstalled={() => void load()}
                  />
                )}
              </>
            )}

            {current?.id === 'advanced' && history.length > 0 && (
              <Panel flush>
                <PanelHeader
                  title="Recent changes"
                  description="Newest first."
                  actions={
                    <ClockCounterClockwise size={15} className="text-fg-subtle" />
                  }
                />
                <ul className="divide-y divide-border">
                  {history.map((c, i) => (
                    <li
                      key={`${c.key}-${c.at ?? i}`}
                      className="flex items-baseline gap-3 px-4 py-2.5 text-[12.5px]"
                    >
                      <span className="shrink-0 font-mono text-fg-muted">{c.key}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">
                        {displayValue(c.to)}
                      </span>
                      {c.actor && <span className="shrink-0 text-fg-subtle">{c.actor}</span>}
                      {c.at && (
                        <span className="shrink-0 text-fg-subtle" title={c.at}>
                          {relativeTime(c.at)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <ContactFooter />
          </div>
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
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-bg py-2 pl-4 pr-2 shadow-lg">
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
