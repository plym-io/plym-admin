import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, PencilSimple, Trash, FolderSimple } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { Category } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ConfirmButton } from '@/components/ui/confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface CategoryForm {
  name: string;
  weight: string;
}

/** Lower weight first; unweighted sink to the bottom, then alphabetical. */
function byWeightThenName(a: Category, b: Category) {
  const aw = a.weight ?? Number.POSITIVE_INFINITY;
  const bw = b.weight ?? Number.POSITIVE_INFINITY;
  return aw === bw ? a.name.localeCompare(b.name) : aw - bw;
}

export default function Categories() {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  useEffect(() => {
    call(api.GET('/api/categories'))
      .then((cats) => setList([...cats].sort(byWeightThenName)))
      .catch((e) =>
        toast.error(isApiError(e) ? e.message : 'Could not load categories'),
      )
      .finally(() => setLoading(false));
  }, []);

  const upsert = (c: Category) =>
    setList((cs) =>
      (cs.some((x) => x.id === c.id)
        ? cs.map((x) => (x.id === c.id ? c : x))
        : [...cs, c]
      ).sort(byWeightThenName),
    );

  const onDelete = async (cat: Category) => {
    try {
      await call(
        api.DELETE('/api/categories/{category_id}', {
          params: { path: { category_id: cat.id } },
        }),
      );
      setList((cs) => cs.filter((c) => c.id !== cat.id));
      toast.success('Category deleted.');
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not delete category');
    }
  };

  return (
    <Page width="text">
      <PageHeader
        title="Categories"
        description="One category per post. Lower weight comes first."
        actions={
          <Button variant="accent" onClick={() => setEditing('new')}>
            <Plus size={16} weight="bold" /> New category
          </Button>
        }
      />

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={FolderSimple}
          title="No categories yet."
          hint="Create one to group your posts."
          action={
            <Button variant="accent" size="sm" onClick={() => setEditing('new')}>
              <Plus size={15} weight="bold" /> New category
            </Button>
          }
        />
      ) : (
        /* No overflow-hidden: it would clip the last row's confirm popover. */
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-bg shadow-xs">
          {list.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 px-4 py-2.5">
              <span className="shrink-0 text-sm font-medium text-fg">{c.name}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle">
                {c.slug}
              </span>
              <span className="shrink-0 text-xs text-fg-muted tnum">
                {c.weight ?? '—'}
              </span>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => setEditing(c)}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <PencilSimple size={16} />
                </button>
                <ConfirmButton
                  icon={Trash}
                  label="Delete"
                  question={`Delete "${c.name}"? Posts in it will become uncategorised.`}
                  confirmLabel="Delete"
                  tone="danger"
                  onConfirm={() => void onDelete(c)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <CategorySheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(c) => {
          upsert(c);
          setEditing(null);
        }}
      />
    </Page>
  );
}

function CategorySheet({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Category | null;
  onClose: () => void;
  onSaved: (c: Category) => void;
}) {
  const { register, handleSubmit, formState } = useForm<CategoryForm>({
    values: {
      name: initial?.name ?? '',
      weight: initial?.weight == null ? '' : String(initial.weight),
    },
  });

  const submit = async (values: CategoryForm) => {
    // Blank weight means "unset" — the API models that as null, not 0.
    const trimmed = values.weight.trim();
    const weight = trimmed === '' ? null : Number(trimmed);
    if (weight !== null && !Number.isInteger(weight)) {
      toast.error('Weight must be a whole number.');
      return;
    }
    try {
      const saved = initial
        ? await call(
            api.PATCH('/api/categories/{category_id}', {
              params: { path: { category_id: initial.id } },
              body: { name: values.name, weight },
            }),
          )
        : await call(
            api.POST('/api/categories', {
              body: { name: values.name, weight },
            }),
          );
      onSaved(saved);
      toast.success(initial ? 'Category updated.' : 'Category created.');
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not save category');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={initial ? 'Edit category' : 'New category'}
    >
      <form onSubmit={handleSubmit(submit)} className="flex h-full flex-col">
        <div className="flex-1 space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {initial ? 'Edit category' : 'New category'}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              The slug is derived from the name by the API.
            </p>
          </div>
          <Field label="Name">
            <Input
              autoFocus
              maxLength={64}
              {...register('name', { required: true, maxLength: 64 })}
              placeholder="e.g. Engineering"
            />
          </Field>
          <Field label="Weight">
            <Input
              type="number"
              step={1}
              {...register('weight')}
              placeholder="Leave blank for no ordering"
            />
          </Field>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            disabled={formState.isSubmitting}
            className="flex-1"
          >
            {formState.isSubmitting
              ? 'Saving…'
              : initial
                ? 'Save changes'
                : 'Add category'}
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
