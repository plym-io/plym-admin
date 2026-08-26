import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { Category } from '@/types';

/**
 * Category picker plus the post's ordering weight — the two fields that decide
 * where a post sits in a listing. Categories are managed on /categories; this
 * only assigns one.
 */
export function CategoryField({
  categoryId,
  weight,
  onChange,
}: {
  categoryId: number | null;
  weight: number | null;
  onChange: (patch: { category_id?: number | null; weight?: number | null }) => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    call(api.GET('/api/categories'))
      .then((list) => {
        if (cancelled) return;
        setCats([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((e) =>
        toast.error(isApiError(e) ? e.message : 'Could not load categories'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Category
        </span>
        <select
          value={categoryId ?? ''}
          onChange={(e) =>
            onChange({
              category_id: e.target.value === '' ? null : Number(e.target.value),
            })
          }
          className="h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none transition-colors hover:border-border-strong focus:border-accent"
        >
          <option value="">Uncategorised</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Weight
        </span>
        <input
          // Remount on external change so the uncontrolled value stays in step.
          key={weight ?? 'none'}
          type="number"
          step={1}
          defaultValue={weight ?? ''}
          placeholder="—"
          onBlur={(e) => {
            const v = e.target.value.trim();
            // Blank means "unset"; the API models that as null, not 0.
            const next = v === '' ? null : Number(v);
            if (next !== null && !Number.isInteger(next)) return;
            if (next !== weight) onChange({ weight: next });
          }}
          className="h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none transition-colors hover:border-border-strong focus:border-accent"
        />
      </label>
    </div>
  );
}
