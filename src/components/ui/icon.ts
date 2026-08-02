import type { IconWeight } from '@phosphor-icons/react';

/**
 * Anything that renders like a Phosphor glyph. Phosphor's own `Icon` type
 * would do, except for the handful of marks it doesn't carry (MCP) that we
 * draw ourselves — this is the shape both satisfy.
 */
export type UiIcon = React.ComponentType<{
  size?: number;
  weight?: IconWeight;
  className?: string;
}>;
