import { cn } from '@/lib/classnames';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  /** `sm` sits inline with 12px text — the editor's footer bar. */
  size?: 'md' | 'sm';
  className?: string;
}

/** A switch. `label` is for screen readers — the visible one lives beside it. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  size = 'md',
  className,
}: Props) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sm ? 'h-3.5 w-6' : 'h-5 w-9',
        checked ? 'border-accent bg-accent' : 'border-border-strong bg-bg-muted',
        className,
      )}
    >
      <span
        className={cn(
          'rounded-full bg-bg shadow-xs transition-transform',
          sm ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5',
          checked
            ? sm
              ? 'translate-x-[11px]'
              : 'translate-x-[18px]'
            : sm
              ? 'translate-x-[1px]'
              : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
