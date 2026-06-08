import { useState } from 'react';
import { motion } from 'motion/react';
import { ImageSquare, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { uploadMedia } from '@/lib/upload';
import { useMediaStore } from '@/store/media';
import { isApiError } from '@/api/errors';
import { cn } from '@/lib/classnames';

interface Props {
  cover?: string | null;
  onChange: (url: string | null) => void;
}

export function CoverWidget({ cover, onChange }: Props) {
  const prepend = useMediaStore((s) => s.prepend);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const item = await uploadMedia(file);
      prepend(item);
      onChange(item.url);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Cover
      </label>
      {cover ? (
        <div className="group relative overflow-hidden rounded-lg border border-border">
          <motion.img
            key={cover}
            src={cover}
            alt="Cover"
            initial={{ opacity: 0, filter: 'blur(8px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.4 }}
            className="aspect-video w-full object-cover"
          />
          <button
            onClick={() => onChange(null)}
            aria-label="Remove cover"
            className="absolute right-2 top-2 rounded-md bg-black/50 p-1 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            'flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition-colors',
            dragging
              ? 'border-accent bg-accent-soft'
              : 'border-border-strong bg-bg-subtle hover:border-accent hover:bg-bg-muted',
          )}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <ImageSquare size={22} weight="duotone" className="text-fg-subtle" />
          <span className="text-xs text-fg-muted">
            {uploading ? 'Uploading…' : 'Drag an image, or click'}
          </span>
        </label>
      )}
    </div>
  );
}
