import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, PencilSimple, Trash, Question } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useFaqStore } from '@/store/faqs';
import type { Faq } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ConfirmButton } from '@/components/ui/confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface FaqForm {
  question: string;
  answer: string;
}

export default function Faqs() {
  const { list, loaded, setList, prepend, update, remove } = useFaqStore();
  const [loading, setLoading] = useState(!loaded);
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);

  useEffect(() => {
    if (loaded) {
      setLoading(false);
      return;
    }
    call(api.GET('/api/faqs'))
      .then(setList)
      .catch((e) => toast.error(isApiError(e) ? e.message : 'Could not load FAQs'))
      .finally(() => setLoading(false));
  }, [loaded, setList]);

  const onDelete = async (faq: Faq) => {
    try {
      await call(api.DELETE('/api/faqs/{faq_id}', { params: { path: { faq_id: faq.id } } }));
      remove(faq.id);
      toast.success('FAQ deleted.');
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not delete FAQ');
    }
  };

  return (
    <Page width="text">
      <PageHeader
        title="FAQs"
        description="Reusable questions and answers you can attach to any post."
        actions={
          <Button variant="accent" onClick={() => setEditing('new')}>
            <Plus size={16} weight="bold" /> New FAQ
          </Button>
        }
      />

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Question}
          title="No FAQs yet."
          hint="Create one to attach it to a post."
          action={
            <Button variant="accent" size="sm" onClick={() => setEditing('new')}>
              <Plus size={15} weight="bold" /> New FAQ
            </Button>
          }
        />
      ) : (
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg shadow-xs">
          {list.map((f) => (
            <div key={f.id} className="group flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{f.question}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{f.answer}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => setEditing(f)}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <PencilSimple size={16} />
                </button>
                <ConfirmButton
                  icon={Trash}
                  label="Delete"
                  question={`Delete "${f.question}"? Posts it's attached to will lose this FAQ.`}
                  confirmLabel="Delete"
                  tone="danger"
                  onConfirm={() => void onDelete(f)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <FaqSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onCreated={(f) => {
          prepend(f);
          setEditing(null);
        }}
        onUpdated={(f) => {
          update(f);
          setEditing(null);
        }}
      />
    </Page>
  );
}

function FaqSheet({
  open,
  initial,
  onClose,
  onCreated,
  onUpdated,
}: {
  open: boolean;
  initial: Faq | null;
  onClose: () => void;
  onCreated: (f: Faq) => void;
  onUpdated: (f: Faq) => void;
}) {
  const { register, handleSubmit, reset, formState } = useForm<FaqForm>({
    values: { question: initial?.question ?? '', answer: initial?.answer ?? '' },
  });

  const submit = async (values: FaqForm) => {
    try {
      if (initial) {
        const updated = await call(
          api.PUT('/api/faqs/{faq_id}', {
            params: { path: { faq_id: initial.id } },
            body: values,
          }),
        );
        onUpdated(updated);
        toast.success('FAQ updated.');
      } else {
        const created = await call(api.POST('/api/faqs', { body: values }));
        onCreated(created);
        toast.success('FAQ created.');
        reset({ question: '', answer: '' });
      }
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not save FAQ');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label={initial ? 'Edit FAQ' : 'New FAQ'}>
      <form onSubmit={handleSubmit(submit)} className="flex h-full flex-col">
        <div className="flex-1 space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {initial ? 'Edit FAQ' : 'New FAQ'}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Available to attach from any post's editor.
            </p>
          </div>
          <Field label="Question">
            <Input
              autoFocus
              maxLength={512}
              {...register('question', { required: true, maxLength: 512 })}
              placeholder="e.g. How do I cancel my subscription?"
            />
          </Field>
          <Field label="Answer">
            <textarea
              maxLength={4096}
              rows={6}
              {...register('answer', { required: true, maxLength: 4096 })}
              placeholder="Write the answer…"
              className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors hover:border-border-strong focus:border-accent"
            />
          </Field>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Keep editing
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={formState.isSubmitting}
            className="flex-1"
          >
            {formState.isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Add FAQ'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
