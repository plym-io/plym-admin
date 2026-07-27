import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Tag as TagIcon } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import type { Tag } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call(api.GET('/api/tags'))
      .then((list) => setTags([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => toast.error(isApiError(e) ? e.message : 'Could not load tags'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Page width="text">
      <PageHeader
        title="Tags"
        description="Created automatically when used on a post. To control display order, use categories."
      />

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={TagIcon}
          title="No tags yet."
          hint="Tags appear here once you add them to a post."
        />
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                #{t.name}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle">
                {t.slug}
              </span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
