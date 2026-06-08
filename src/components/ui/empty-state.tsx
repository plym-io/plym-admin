import { motion } from 'motion/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/classnames';

interface Props {
  icon?: Icon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Empty states have voice (BRD §4). Centered, quiet, with one optional action. */
export function EmptyState({ icon: Icon, title, hint, action, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-20 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="rounded-full bg-bg-muted p-3 text-fg-subtle">
          <Icon size={22} weight="duotone" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {hint && <p className="text-sm text-fg-muted">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}
