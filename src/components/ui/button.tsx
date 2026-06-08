import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/classnames';

const button = cva(
  'inline-flex items-center justify-center gap-2 font-medium select-none whitespace-nowrap rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:
          'bg-fg text-bg hover:bg-fg/90 shadow-xs',
        accent:
          'bg-accent text-white hover:brightness-105 shadow-xs',
        secondary:
          'bg-bg-subtle text-fg border border-border hover:bg-bg-muted',
        ghost: 'text-fg-muted hover:text-fg hover:bg-bg-muted',
        danger:
          'text-danger hover:bg-danger/10',
        link: 'text-accent hover:underline underline-offset-2 px-0',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'ref'>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className={cn(button({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
