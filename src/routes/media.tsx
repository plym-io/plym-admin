import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { UploadSimple, Images, ArrowRight } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { isApiError } from '@/api/errors';
import { uploadMedia } from '@/lib/upload';
import { useMediaStore } from '@/store/media';
import type { MediaItem } from '@/types';
import { Page, PageHeader } from '@/components/ui/page';
import { MediaTile } from '@/components/media/MediaTile';
import { MediaSheet } from '@/components/media/MediaSheet';
import { UploadProgress } from '@/components/media/UploadProgress';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface InUse {
  message: string;
  posts: { id: number; title: string }[];
}

const PAGE_SIZE = 20;

export default function Media() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { list, loaded, setList, append, prepend, remove, addUpload, updateUpload, clearUpload } =
    useMediaStore();
  const [loading, setLoading] = useState(!loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  // Server count fetched so far; kept apart from `list.length` so uploads/deletes
  // (which mutate the list optimistically) don't skew the "has more" check.
  const [loadedCount, setLoadedCount] = useState(0);
  const [active, setActive] = useState<MediaItem | null>(null);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [inUse, setInUse] = useState<InUse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    call(api.GET('/api/media', { params: { query: { page: 1, page_size: PAGE_SIZE } } }))
      .then((p) => {
        setList(p.items);
        setTotal(p.total);
        setPage(1);
        setLoadedCount(p.items.length);
      })
      .catch((e) => toast.error(isApiError(e) ? e.message : 'Could not load media'))
      .finally(() => setLoading(false));
  }, [setList]);

  const hasMore = total !== null && loadedCount < total;

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const p = await call(
        api.GET('/api/media', { params: { query: { page: next, page_size: PAGE_SIZE } } }),
      );
      append(p.items);
      setPage(next);
      setLoadedCount((c) => c + p.items.length);
      setTotal(p.total);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Could not load more media');
    } finally {
      setLoadingMore(false);
    }
  };

  // ⌘K "Upload media" deep-links here with ?upload=1.
  useEffect(() => {
    if (params.get('upload') === '1') {
      fileInput.current?.click();
      params.delete('upload');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      for (const file of files.filter((f) => f.type.startsWith('image/'))) {
        const uid = crypto.randomUUID();
        addUpload({ id: uid, name: file.name, progress: 0, status: 'uploading' });
        try {
          const item = await uploadMedia(file, (p) =>
            updateUpload(uid, { progress: p }),
          );
          updateUpload(uid, { status: 'done', progress: 1 });
          prepend(item);
          setNewIds((s) => new Set(s).add(item.id));
          setTimeout(() => clearUpload(uid), 1500);
          setTimeout(
            () =>
              setNewIds((s) => {
                const n = new Set(s);
                n.delete(item.id);
                return n;
              }),
            1200,
          );
        } catch (e) {
          updateUpload(uid, {
            status: 'error',
            error: isApiError(e) ? e.message : 'Failed',
          });
          toast.error(isApiError(e) ? e.message : 'Upload failed');
          setTimeout(() => clearUpload(uid), 4000);
        }
      }
    },
    [addUpload, updateUpload, prepend, clearUpload],
  );

  // Page-wide drag overlay.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) {
        void handleFiles(Array.from(e.dataTransfer.files));
      }
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onOver);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onOver);
    };
  }, [handleFiles]);

  const del = async (item: MediaItem) => {
    setActive(null);
    remove(item.id); // optimistic
    let undone = false;
    toast(`Deleted ${item.original_name ?? item.filename}`, {
      duration: 8000,
      action: { label: 'Undo', onClick: () => { undone = true; prepend(item); } },
      onAutoClose: () => {
        if (undone) return;
        void call(
          api.DELETE('/api/media/{media_id}', {
            params: { path: { media_id: item.id } },
          }),
        ).catch((e) => {
          prepend(item); // restore
          if (isApiError(e) && e.code.includes('in_use')) {
            const raw = e.raw as
              | { detail?: { posts?: { id: number; title: string }[] } }
              | null;
            setInUse({
              message: e.message,
              posts: raw?.detail?.posts ?? [],
            });
          } else {
            toast.error(isApiError(e) ? e.message : 'Delete failed');
          }
        });
      },
    });
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      <Page width="wide">
        <PageHeader
          title="Media"
          description={
            loaded
              ? total !== null && total > list.length
                ? `${list.length} of ${total} images`
                : `${list.length} images`
              : undefined
          }
          actions={
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <UploadSimple size={16} /> Upload
            </Button>
          }
        />

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={Images}
              title="No images yet."
              hint="Drag files anywhere on this page to upload."
              action={
                <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                  <UploadSimple size={16} /> Upload your first image
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              <AnimatePresence>
                {list.map((item) => (
                  <MediaTile
                    key={item.id}
                    item={item}
                    isNew={newIds.has(item.id)}
                    onOpen={() => setActive(item)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {!loading && hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Load more (${total! - loadedCount} left)`}
              </Button>
            </div>
          )}
        </div>
      </Page>

      {/* Page-wide drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent-soft backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-bg/80 px-12 py-10">
              <UploadSimple size={32} weight="duotone" className="text-accent" />
              <p className="text-[15px] font-medium text-fg">Drop to upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MediaSheet item={active} onClose={() => setActive(null)} onDelete={del} />
      <UploadProgress />

      {/* in-use bottom sheet (BRD §6.5) */}
      <Sheet
        open={!!inUse}
        side="bottom"
        onClose={() => setInUse(null)}
        label="Image in use"
      >
        {inUse && (
          <div className="p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              {inUse.posts.length > 0
                ? `This image is in use in ${inUse.posts.length} ${
                    inUse.posts.length === 1 ? 'post' : 'posts'
                  }.`
                : 'This image is still in use.'}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{inUse.message}</p>
            {inUse.posts.length > 0 && (
              <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                {inUse.posts.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => {
                        setInUse(null);
                        navigate(`/posts/${p.id}`);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-muted"
                    >
                      <span className="truncate">{p.title}</span>
                      <ArrowRight size={15} className="text-fg-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {inUse.posts.length > 0 && (
              <Button
                variant="accent"
                className="mt-4 w-full"
                onClick={() => {
                  const first = inUse.posts[0];
                  setInUse(null);
                  navigate(`/posts/${first.id}`);
                }}
              >
                Take me to the first one <ArrowRight size={16} />
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
