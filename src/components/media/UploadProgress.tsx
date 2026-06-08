import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, WarningCircle, Spinner } from '@phosphor-icons/react';
import { useMediaStore } from '@/store/media';

/** Stacked upload progress rows, bottom-right (sonner-style). */
export function UploadProgress() {
  const uploads = useMediaStore((s) => s.uploads);
  if (uploads.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-72 flex-col gap-2">
      <AnimatePresence>
        {uploads.map((u) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto overflow-hidden rounded-lg border border-border bg-bg-subtle p-3 shadow-md"
          >
            <div className="flex items-center gap-2">
              {u.status === 'uploading' && (
                <Spinner size={15} className="animate-spin text-accent" />
              )}
              {u.status === 'done' && (
                <CheckCircle size={15} weight="fill" className="text-success" />
              )}
              {u.status === 'error' && (
                <WarningCircle size={15} weight="fill" className="text-danger" />
              )}
              <span className="truncate text-[13px] text-fg">{u.name}</span>
              <span className="ml-auto text-[11px] text-fg-subtle tnum">
                {u.status === 'uploading'
                  ? `${Math.round(u.progress * 100)}%`
                  : u.status === 'done'
                    ? 'Done'
                    : 'Failed'}
              </span>
            </div>
            {u.status === 'uploading' && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-muted">
                <motion.div
                  className="h-full bg-accent"
                  animate={{ width: `${u.progress * 100}%` }}
                  transition={{ ease: 'linear', duration: 0.2 }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
