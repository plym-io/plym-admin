interface Props {
  size?: number;
  className?: string;
  /** Accepted so this drops in wherever a Phosphor icon goes; the mark is
   *  stroke-only, so there is no lighter or heavier cut to switch to. */
  weight?: unknown;
}

/**
 * The Model Context Protocol mark, traced from the official logo
 * (modelcontextprotocol.io). Kept as a local component because Phosphor has
 * no equivalent, and drawn in `currentColor` so it takes the nav's active and
 * hover colours like every other icon.
 *
 * The viewBox crops the wordmark off the source artwork and squares up what's
 * left, so it optically matches a 20px Phosphor glyph beside it.
 */
export function McpIcon({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="10.25 16.94 172.6 172.6"
      fill="none"
      stroke="currentColor"
      strokeWidth={12}
      strokeLinecap="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706V29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177" />
      <path d="M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52" />
      <path d="M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087V131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822" />
    </svg>
  );
}
