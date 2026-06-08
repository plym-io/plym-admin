import { motion } from 'motion/react';
import type { MediaItem } from '@/types';
import { fileSize } from '@/lib/format';

interface Props {
  item: MediaItem;
  isNew?: boolean;
  onOpen: () => void;
}

/** Square media tile — drag to editor, click for the detail sheet. */
export function MediaTile({ item, isNew, onOpen }: Props) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      draggable
      onDragStart={(e) => {
        const dt = (e as unknown as React.DragEvent).dataTransfer;
        dt?.setData(
          'application/x-plym-media',
          JSON.stringify({ url: item.url, alt: item.original_name ?? '' }),
        );
      }}
      className={[
        'group relative aspect-square overflow-hidden rounded-lg border border-border bg-bg-muted',
        'cursor-grab transition-transform active:cursor-grabbing',
        isNew ? 'animate-ring-pulse' : '',
      ].join(' ')}
    >
      <img
        src={item.url}
        alt={item.original_name ?? item.filename}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-220 group-hover:scale-[0.98]"
      />
      <span className="pointer-events-none absolute inset-0 rounded-lg ring-0 ring-accent transition-all group-hover:ring-2" />
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-left text-[11px] font-medium text-white">
          {item.original_name ?? item.filename}
        </p>
        <p className="text-left text-[10px] text-white/70 tnum">
          {fileSize(item.size_bytes)}
          {item.width && item.height
            ? ` · ${item.width}×${item.height}`
            : ''}
        </p>
      </div>
    </motion.button>
  );
}
