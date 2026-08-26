import { useState } from 'react';
import { Copy, Check, Trash } from '@phosphor-icons/react';
import type { MediaItem } from '@/types';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { fileSize, fullTimestamp } from '@/lib/format';

interface Props {
  item: MediaItem | null;
  onClose: () => void;
  onDelete: (item: MediaItem) => void;
}

export function MediaSheet({ item, onClose, onDelete }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet open={!!item} onClose={onClose} label="Media detail">
      {item && (
        <div className="flex h-full flex-col">
          <div className="border-b border-border bg-bg-muted p-6">
            <img
              src={item.url}
              alt={item.original_name ?? item.filename}
              className="mx-auto max-h-72 w-auto rounded-md object-contain shadow-sm"
            />
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div>
              <p className="truncate text-[15px] font-medium text-fg">
                {item.original_name ?? item.filename}
              </p>
              <p className="mt-0.5 text-sm text-fg-muted tnum">
                {fileSize(item.size_bytes)}
                {item.width && item.height
                  ? ` · ${item.width}×${item.height}`
                  : ''}{' '}
                · {item.mime_type}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                URL
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-bg-muted px-2.5 py-1.5 font-mono text-xs text-fg-muted">
                  {item.url}
                </code>
                <Button size="icon" variant="secondary" onClick={copy} aria-label="Copy URL">
                  {copied ? (
                    <Check size={15} className="text-success" />
                  ) : (
                    <Copy size={15} />
                  )}
                </Button>
              </div>
            </div>

            <p className="text-xs text-fg-subtle">
              Uploaded {fullTimestamp(item.created_at)}
            </p>
          </div>

          <div className="border-t border-border p-4">
            <Button
              variant="danger"
              className="w-full"
              onClick={() => onDelete(item)}
            >
              <Trash size={16} /> Delete image
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
