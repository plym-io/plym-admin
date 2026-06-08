import { forwardRef } from 'react';
import { cn } from '@/lib/classnames';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg',
      'placeholder:text-fg-subtle transition-colors',
      'hover:border-border-strong focus:border-accent focus:outline-none',
      'focus-visible:outline-none',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
