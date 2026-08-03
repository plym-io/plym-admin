import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MagnifyingGlass, Question, Plus, Check } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useFaqStore } from '@/store/faqs';
import type { Faq } from '@/types';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/classnames';

interface Props {
  open: boolean;
  onClose: () => void;
  selected: Faq[];
  onChange: (faqs: Faq[]) => void;
}

/** Side sheet for attaching FAQs to a post — pick from the pool, or create new inline. */
export function FaqPicker({ open, onClose, selected, onChange }: Props) {
  const { list, loaded, setList, prepend } = useFaqStore();
  const [loading, setLoading] = useState(!loaded);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    call(api.GET('/api/faqs'))
      .then(setList)
      .catch((e) => isApiError(e) && setList([]))
      .finally(() => setLoading(false));
  }, [open, loaded, setList]);

  const visible = list.filter((f) =>
    f.question.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const isSelected = (id: number) => selected.some((f) => f.id === id);

  const toggle = (faq: Faq) => {
    onChange(
      isSelected(faq.id)
        ? selected.filter((f) => f.id !== faq.id)
        : [...selected, faq],
    );
  };

  const onCreated = (faq: Faq) => {
    prepend(faq);
    onChange([...selected, faq]);
    setCreating(false);
  };

  return (
    <Sheet open={open} onClose={onClose} label="Choose FAQs">
      <div className="flex h-full flex-col">
        <div className="space-y-3 border-b border-border p-5">
          <h2 className="text-lg font-semibold tracking-tight">Attach FAQs</h2>
          {creating ? (
            <NewFaqForm onCancel={() => setCreating(false)} onCreated={onCreated} />
          ) : (
            <>
              <div className="relative">
                <MagnifyingGlass
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search FAQs…"
                  className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setCreating(true)}
              >
                <Plus size={15} weight="bold" /> New FAQ
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Question}
              title={query ? 'No matches.' : 'No FAQs yet.'}
              hint={query ? 'Try another search.' : 'Create one to get started.'}
            />
          ) : (
            <ul className="space-y-1.5">
              {visible.map((f) => {
                const picked = isSelected(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                        picked
                          ? 'border-accent bg-accent-soft'
                          : 'border-border hover:border-border-strong hover:bg-bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          picked
                            ? 'border-accent bg-accent text-accent-fg'
                            : 'border-border-strong',
                        )}
                      >
                        {picked && <Check size={11} weight="bold" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">
                          {f.question}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">
                          {f.answer}
                        </p>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function NewFaqForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (faq: Faq) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valid = question.trim().length > 0 && answer.trim().length > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const created = await call(
        api.POST('/api/faqs', { body: { question: question.trim(), answer: answer.trim() } }),
      );
      toast.success('FAQ created.');
      onCreated(created);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not create FAQ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <input
        autoFocus
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question"
        maxLength={512}
        className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none transition-colors hover:border-border-strong focus:border-accent"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Answer"
        rows={3}
        maxLength={4096}
        className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors hover:border-border-strong focus:border-accent"
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          className="flex-1"
          disabled={!valid || submitting}
          onClick={() => void submit()}
        >
          {submitting ? 'Adding…' : 'Add & attach'}
        </Button>
      </div>
    </div>
  );
}
