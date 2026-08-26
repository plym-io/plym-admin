import { useEffect } from 'react';
import { useMotionValue, useTransform, animate, motion } from 'motion/react';

interface Props {
  value: number;
  /** Decimal places to show. */
  decimals?: number;
  className?: string;
}

/** Count-up animation on value change (BRD §4 — "Numbers animate"). */
export function AnimatedNumber({ value, decimals = 0, className }: Props) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => v.toFixed(decimals));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    });
    return controls.stop;
  }, [value, mv]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
