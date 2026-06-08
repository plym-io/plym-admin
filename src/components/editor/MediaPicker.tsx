import { useEffect, useState } from 'react';
import { MagnifyingGlass, Images } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useMediaStore } from '@/store/media';
import type { MediaItem } from '@/types';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
}

/** Side sheet for choosing an existing image to insert into the editor. */
export function MediaPicker({ open, onClose, onPick }: Props) {
  const { list, loaded, setList } = useMediaStore();
  const [loading, setLoading] = useState(!loaded);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open || loaded) return;
    call(api.GET('/api/media', { params: { query: { page: 1, page_size: 100 } } }))
      .then((p) => setList(p.items))
      .catch((e) => isApiError(e) && setList([]))
      .finally(() => setLoading(false));
  }, [open, loaded, setList]);

  const visible = list.filter((m) =>
    (m.original_name ?? m.filename)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <Sheet open={open} onClose={onClose} label="Choose media">
      <div className="flex h-full flex-col">
        <div className="space-y-3 border-b border-border p-5">
          <h2 className="text-lg font-semibold tracking-tight">Insert media</h2>
          <div className="relative">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library…"
              className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Images}
              title={query ? 'No matches.' : 'Your library is empty.'}
              hint={query ? 'Try another search.' : 'Upload an image first.'}
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {visible.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onPick(m)}
                  className="group aspect-square overflow-hidden rounded-lg border border-border bg-bg-muted transition-transform hover:ring-2 hover:ring-accent"
                  title={m.original_name ?? m.filename}
                >
                  <img
                    src={m.url}
                    alt={m.original_name ?? m.filename}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[0.97]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
